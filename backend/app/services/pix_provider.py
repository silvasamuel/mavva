"""Pix charges for donations: Mercado Pago in production, a fake locally.

The rest of the app only sees `PixCharge` / `PixStatus`; swapping the provider
(or running without credentials) never touches the support flow itself.
Credentials come from the environment (see Settings) and are never logged.
"""

import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, Protocol

import mercadopago
from mercadopago.config import RequestOptions

from app.core.config import get_settings

logger = logging.getLogger("mavva.pix")

PIX_EXPIRES_IN = timedelta(minutes=30)
# ISO 8601 duration for the same window (Mercado Pago's minimum for Pix).
PIX_EXPIRATION_TIME = "PT30M"


class PixStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class PixCharge:
    provider: str
    provider_payment_id: str
    qr_code: str
    ticket_url: str | None
    expires_at: datetime


class PixProviderError(Exception):
    """The provider refused or failed to answer; the player sees a generic error."""


class PixProvider(Protocol):
    name: str

    def create_charge(
        self,
        *,
        amount_cents: int,
        description: str,
        payer_email: str,
        payer_name: str,
        reference: str,
    ) -> PixCharge: ...

    def fetch_status(self, provider_payment_id: str) -> PixStatus: ...


# --- Mercado Pago (Orders API) ---------------------------------------------------

# https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status
_MP_APPROVED = {"processed"}
_MP_CANCELLED = {"canceled", "cancelled", "failed", "refunded", "charged_back"}


def mercadopago_status(status: str) -> PixStatus:
    """Order `status` → ours. `processed` is the only state where money arrived."""
    if status in _MP_APPROVED:
        return PixStatus.APPROVED
    if status in _MP_CANCELLED:
        return PixStatus.CANCELLED
    return PixStatus.PENDING


def _reais(amount_cents: int) -> str:
    """The Orders API takes amounts as strings with two decimals: 1250 → "12.50"."""
    return f"{amount_cents // 100}.{amount_cents % 100:02d}"


class MercadoPagoPix:
    name = "mercadopago"

    def __init__(
        self, access_token: str, *, sandbox_auto_approve: bool = False, sdk: Any | None = None
    ) -> None:
        self._sdk = sdk if sdk is not None else mercadopago.SDK(access_token)
        self._auto_approve = sandbox_auto_approve

    def create_charge(
        self,
        *,
        amount_cents: int,
        description: str,
        payer_email: str,
        payer_name: str,
        reference: str,
    ) -> PixCharge:
        expires_at = datetime.now(UTC) + PIX_EXPIRES_IN
        amount = _reais(amount_cents)
        first_name = payer_name.split()[0] if payer_name.strip() else "Apoiador"
        body = {
            "type": "online",
            "total_amount": amount,
            "external_reference": reference,
            "processing_mode": "automatic",
            "transactions": {
                "payments": [
                    {
                        "amount": amount,
                        "payment_method": {"id": "pix", "type": "bank_transfer"},
                        "expiration_time": PIX_EXPIRATION_TIME,
                    }
                ]
            },
            # "APRO" is the sandbox's cue to approve the charge by itself.
            "payer": {
                "email": payer_email,
                "first_name": "APRO" if self._auto_approve else first_name,
            },
        }
        options = RequestOptions()
        options.custom_headers = {"x-idempotency-key": reference}
        try:
            result = self._sdk.order().create(body, options)
        except Exception as error:  # the SDK raises on network and parsing errors
            logger.warning("Mercado Pago call failed: %s", str(error)[:200])
            raise PixProviderError from error
        if result.get("status") not in (200, 201):
            logger.warning(
                "Mercado Pago refused the Pix order (%s): %s",
                result.get("status"),
                _error_summary(result.get("response")),
            )
            raise PixProviderError(f"status {result.get('status')}")
        order = result.get("response") or {}
        payments = (order.get("transactions") or {}).get("payments") or []
        method = (payments[0].get("payment_method") if payments else None) or {}
        qr_code = method.get("qr_code")
        if not order.get("id") or not qr_code:
            logger.warning("Mercado Pago answered without a Pix code (order %s)", order.get("id"))
            raise PixProviderError("missing qr_code")
        return PixCharge(
            provider=self.name,
            provider_payment_id=str(order["id"]),
            qr_code=qr_code,
            ticket_url=method.get("ticket_url"),
            expires_at=expires_at,
        )

    def fetch_status(self, provider_payment_id: str) -> PixStatus:
        try:
            result = self._sdk.order().get(provider_payment_id)
        except Exception as error:
            logger.warning("Mercado Pago status lookup failed: %s", str(error)[:200])
            raise PixProviderError from error
        if result.get("status") != 200:
            logger.warning("Mercado Pago status lookup answered %s", result.get("status"))
            raise PixProviderError(f"status {result.get('status')}")
        order = result.get("response") or {}
        return mercadopago_status(str(order.get("status", "")))


def _error_summary(response: Any) -> str:
    if isinstance(response, dict):
        return str(response.get("message") or response.get("errors") or response)[:200]
    return str(response)[:200]


def verify_mercadopago_signature(
    *, secret: str, x_signature: str | None, x_request_id: str | None, data_id: str
) -> bool:
    """Checks the `x-signature` header of a webhook call.

    Mercado Pago signs `id:{data.id};request-id:{x-request-id};ts:{ts};` with
    HMAC-SHA256 using the app's secret; `ts` and the hex digest (`v1`) travel
    in the header as `ts=...,v1=...`. The id is compared in lowercase and a
    part whose value is missing is left out of the manifest, as documented.
    """
    if not x_signature:
        return False
    parts: dict[str, str] = {}
    for chunk in x_signature.split(","):
        key, _, value = chunk.strip().partition("=")
        parts[key.strip()] = value.strip()
    ts, v1 = parts.get("ts"), parts.get("v1")
    if not ts or not v1:
        return False
    manifest = ""
    if data_id:
        manifest += f"id:{data_id.lower()};"
    if x_request_id:
        manifest += f"request-id:{x_request_id};"
    manifest += f"ts:{ts};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


# --- Development stand-in -----------------------------------------------------


class FakePix:
    """No credentials: issues a Pix-looking code that only `approve` can settle."""

    name = "fake"

    def __init__(self) -> None:
        self._status: dict[str, PixStatus] = {}

    def create_charge(
        self,
        *,
        amount_cents: int,
        description: str,
        payer_email: str,
        payer_name: str,
        reference: str,
    ) -> PixCharge:
        payment_id = f"fake-{uuid.uuid4().hex[:12]}"
        self._status[payment_id] = PixStatus.PENDING
        amount = _reais(amount_cents)
        qr_code = (
            "00020126360014br.gov.bcb.pix0114+5500000000000"
            f"52040000530398654{len(amount):02d}{amount}5802BR5905MAVVA6009SAO PAULO"
            f"62{len(payment_id) + 4:02d}05{len(payment_id):02d}{payment_id}6304FAKE"
        )
        return PixCharge(
            provider=self.name,
            provider_payment_id=payment_id,
            qr_code=qr_code,
            ticket_url=None,
            expires_at=datetime.now(UTC) + PIX_EXPIRES_IN,
        )

    def fetch_status(self, provider_payment_id: str) -> PixStatus:
        return self._status.get(provider_payment_id, PixStatus.PENDING)

    def approve(self, provider_payment_id: str) -> None:
        self._status[provider_payment_id] = PixStatus.APPROVED


_fake = FakePix()


def get_pix_provider() -> PixProvider:
    """The real provider when configured; the fake one only outside production.

    Production without credentials refuses instead of issuing codes nobody can
    pay: the page shows the generic "try again later" error.
    """
    settings = get_settings()
    if settings.mercadopago_access_token:
        return MercadoPagoPix(
            settings.mercadopago_access_token,
            sandbox_auto_approve=(
                settings.mercadopago_sandbox_auto_approve and not settings.is_production
            ),
        )
    if settings.is_production:
        logger.error("MERCADOPAGO_ACCESS_TOKEN is not set; Pix donations are unavailable")
        raise PixProviderError("provider not configured")
    return _fake

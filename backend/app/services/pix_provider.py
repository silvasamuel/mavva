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
from typing import Protocol

import httpx

from app.core.config import get_settings

logger = logging.getLogger("mavva.pix")

PIX_EXPIRES_IN = timedelta(minutes=30)
MERCADOPAGO_API = "https://api.mercadopago.com"


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
        self, *, amount_cents: int, description: str, payer_email: str, reference: str
    ) -> PixCharge: ...

    def fetch_status(self, provider_payment_id: str) -> PixStatus: ...


# --- Mercado Pago ------------------------------------------------------------

# https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
_MP_APPROVED = {"approved"}
_MP_CANCELLED = {"cancelled", "rejected", "refunded", "charged_back"}


def mercadopago_status(status: str) -> PixStatus:
    if status in _MP_APPROVED:
        return PixStatus.APPROVED
    if status in _MP_CANCELLED:
        return PixStatus.CANCELLED
    return PixStatus.PENDING


class MercadoPagoPix:
    name = "mercadopago"

    def __init__(self, access_token: str, notification_url: str | None) -> None:
        self._token = access_token
        self._notification_url = notification_url

    def _headers(self, idempotency_key: str | None = None) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self._token}"}
        if idempotency_key:
            headers["X-Idempotency-Key"] = idempotency_key
        return headers

    def create_charge(
        self, *, amount_cents: int, description: str, payer_email: str, reference: str
    ) -> PixCharge:
        expires_at = datetime.now(UTC) + PIX_EXPIRES_IN
        body = {
            "transaction_amount": round(amount_cents / 100, 2),
            "description": description,
            "payment_method_id": "pix",
            "payer": {"email": payer_email},
            "external_reference": reference,
            # Mercado Pago wants the offset spelled out, not "Z".
            "date_of_expiration": expires_at.strftime("%Y-%m-%dT%H:%M:%S.000+00:00"),
        }
        if self._notification_url:
            body["notification_url"] = self._notification_url
        try:
            response = httpx.post(
                f"{MERCADOPAGO_API}/v1/payments",
                headers=self._headers(idempotency_key=reference),
                json=body,
                timeout=15,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            logger.warning("Mercado Pago refused the Pix charge: %s", error)
            raise PixProviderError from error
        data = response.json()
        transaction = (data.get("point_of_interaction") or {}).get("transaction_data") or {}
        qr_code = transaction.get("qr_code")
        if not qr_code:
            logger.warning("Mercado Pago answered without a Pix code (payment %s)", data.get("id"))
            raise PixProviderError("missing qr_code")
        return PixCharge(
            provider=self.name,
            provider_payment_id=str(data["id"]),
            qr_code=qr_code,
            ticket_url=transaction.get("ticket_url"),
            expires_at=expires_at,
        )

    def fetch_status(self, provider_payment_id: str) -> PixStatus:
        try:
            response = httpx.get(
                f"{MERCADOPAGO_API}/v1/payments/{provider_payment_id}",
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            logger.warning("Mercado Pago status lookup failed: %s", error)
            raise PixProviderError from error
        return mercadopago_status(str(response.json().get("status", "")))


def verify_mercadopago_signature(
    *, secret: str, x_signature: str | None, x_request_id: str | None, data_id: str
) -> bool:
    """Checks the `x-signature` header of a webhook call.

    Mercado Pago signs `id:{data.id};request-id:{x-request-id};ts:{ts};` with
    HMAC-SHA256 using the app's secret; `ts` and the hex digest (`v1`) travel
    in the header as `ts=...,v1=...`.
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
    manifest = f"id:{data_id.lower()};request-id:{x_request_id or ''};ts:{ts};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


# --- Development stand-in -----------------------------------------------------


class FakePix:
    """No credentials: issues a Pix-looking code that only `approve` can settle."""

    name = "fake"

    def __init__(self) -> None:
        self._status: dict[str, PixStatus] = {}

    def create_charge(
        self, *, amount_cents: int, description: str, payer_email: str, reference: str
    ) -> PixCharge:
        payment_id = f"fake-{uuid.uuid4().hex[:12]}"
        self._status[payment_id] = PixStatus.PENDING
        amount = f"{amount_cents / 100:.2f}"
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
    settings = get_settings()
    if settings.mercadopago_access_token:
        return MercadoPagoPix(
            settings.mercadopago_access_token,
            notification_url=f"{settings.public_origin}/api/v1/support/webhooks/mercadopago",
        )
    return _fake

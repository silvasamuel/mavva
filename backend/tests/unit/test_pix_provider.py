"""Mercado Pago adapter: request shape, response parsing and webhook signatures."""

import hashlib
import hmac
from typing import Any

import httpx
import pytest

from app.services.pix_provider import (
    FakePix,
    MercadoPagoPix,
    PixProviderError,
    PixStatus,
    mercadopago_status,
    verify_mercadopago_signature,
)


class TestSignature:
    SECRET = "s3cr3t"

    def _sign(self, data_id: str, request_id: str, ts: str) -> str:
        manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
        digest = hmac.new(self.SECRET.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        return f"ts={ts},v1={digest}"

    def test_accepts_a_valid_signature(self) -> None:
        header = self._sign("123456", "req-1", "1700000000000")
        assert verify_mercadopago_signature(
            secret=self.SECRET, x_signature=header, x_request_id="req-1", data_id="123456"
        )

    def test_rejects_a_tampered_id(self) -> None:
        header = self._sign("123456", "req-1", "1700000000000")
        assert not verify_mercadopago_signature(
            secret=self.SECRET, x_signature=header, x_request_id="req-1", data_id="654321"
        )

    def test_rejects_missing_or_malformed_header(self) -> None:
        assert not verify_mercadopago_signature(
            secret=self.SECRET, x_signature=None, x_request_id="r", data_id="1"
        )
        assert not verify_mercadopago_signature(
            secret=self.SECRET, x_signature="ts=1", x_request_id="r", data_id="1"
        )

    def test_alphanumeric_ids_are_compared_lowercase(self) -> None:
        header = self._sign("abc123def", "req-1", "1700000000000")
        assert verify_mercadopago_signature(
            secret=self.SECRET, x_signature=header, x_request_id="req-1", data_id="ABC123DEF"
        )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("approved", PixStatus.APPROVED),
        ("pending", PixStatus.PENDING),
        ("in_process", PixStatus.PENDING),
        ("cancelled", PixStatus.CANCELLED),
        ("rejected", PixStatus.CANCELLED),
        ("refunded", PixStatus.CANCELLED),
        ("charged_back", PixStatus.CANCELLED),
        ("", PixStatus.PENDING),
    ],
)
def test_status_mapping(raw: str, expected: PixStatus) -> None:
    assert mercadopago_status(raw) == expected


class TestMercadoPagoCharge:
    def test_posts_a_pix_payment_and_reads_the_code(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured: dict[str, Any] = {}

        def fake_post(url: str, **kwargs: Any) -> httpx.Response:
            captured["url"] = url
            captured.update(kwargs)
            return httpx.Response(
                201,
                json={
                    "id": 987654321,
                    "status": "pending",
                    "point_of_interaction": {
                        "transaction_data": {
                            "qr_code": "00020126...MAVVA",
                            "qr_code_base64": "iVBORw0...",
                            "ticket_url": "https://www.mercadopago.com.br/payments/987/ticket",
                        }
                    },
                },
                request=httpx.Request("POST", url),
            )

        monkeypatch.setattr(httpx, "post", fake_post)
        provider = MercadoPagoPix("APP_USR-test", notification_url="https://mavva.test/hook")
        charge = provider.create_charge(
            amount_cents=1250, description="Apoio", payer_email="a@b.c", reference="ref-1"
        )

        assert captured["url"].endswith("/v1/payments")
        assert captured["headers"]["Authorization"] == "Bearer APP_USR-test"
        assert captured["headers"]["X-Idempotency-Key"] == "ref-1"
        body = captured["json"]
        assert body["transaction_amount"] == 12.5
        assert body["payment_method_id"] == "pix"
        assert body["payer"] == {"email": "a@b.c"}
        assert body["external_reference"] == "ref-1"
        assert body["notification_url"] == "https://mavva.test/hook"
        assert body["date_of_expiration"].endswith("+00:00")
        assert charge.provider == "mercadopago"
        assert charge.provider_payment_id == "987654321"
        assert charge.qr_code == "00020126...MAVVA"
        assert charge.ticket_url is not None and charge.ticket_url.endswith("/ticket")

    def test_http_errors_become_provider_errors(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def failing_post(url: str, **kwargs: Any) -> httpx.Response:
            return httpx.Response(400, json={"message": "bad"}, request=httpx.Request("POST", url))

        monkeypatch.setattr(httpx, "post", failing_post)
        provider = MercadoPagoPix("APP_USR-test", notification_url=None)
        with pytest.raises(PixProviderError):
            provider.create_charge(
                amount_cents=500, description="Apoio", payer_email="a@b.c", reference="ref"
            )

    def test_answer_without_code_is_an_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def odd_post(url: str, **kwargs: Any) -> httpx.Response:
            return httpx.Response(
                201, json={"id": 1, "status": "pending"}, request=httpx.Request("POST", url)
            )

        monkeypatch.setattr(httpx, "post", odd_post)
        provider = MercadoPagoPix("APP_USR-test", notification_url=None)
        with pytest.raises(PixProviderError):
            provider.create_charge(
                amount_cents=500, description="Apoio", payer_email="a@b.c", reference="ref"
            )

    def test_fetch_status_maps_the_provider_answer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_get(url: str, **kwargs: Any) -> httpx.Response:
            assert url.endswith("/v1/payments/42")
            return httpx.Response(
                200, json={"id": 42, "status": "approved"}, request=httpx.Request("GET", url)
            )

        monkeypatch.setattr(httpx, "get", fake_get)
        provider = MercadoPagoPix("APP_USR-test", notification_url=None)
        assert provider.fetch_status("42") == PixStatus.APPROVED


def test_fake_provider_only_settles_when_told() -> None:
    provider = FakePix()
    charge = provider.create_charge(
        amount_cents=1000, description="Apoio", payer_email="a@b.c", reference="r"
    )
    assert charge.provider == "fake"
    assert charge.qr_code.startswith("000201")
    assert provider.fetch_status(charge.provider_payment_id) == PixStatus.PENDING
    provider.approve(charge.provider_payment_id)
    assert provider.fetch_status(charge.provider_payment_id) == PixStatus.APPROVED

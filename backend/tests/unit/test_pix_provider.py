"""Mercado Pago adapter: request shape, response parsing and webhook signatures."""

import hashlib
import hmac
from typing import Any

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
        header = self._sign("ord01abc", "req-1", "1700000000000")
        assert verify_mercadopago_signature(
            secret=self.SECRET, x_signature=header, x_request_id="req-1", data_id="ORD01ABC"
        )

    def test_a_missing_request_id_is_left_out_of_the_manifest(self) -> None:
        manifest = "id:ord01abc;ts:1700000000000;"
        digest = hmac.new(self.SECRET.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        assert verify_mercadopago_signature(
            secret=self.SECRET,
            x_signature=f"ts=1700000000000,v1={digest}",
            x_request_id=None,
            data_id="ORD01ABC",
        )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("processed", PixStatus.APPROVED),
        ("created", PixStatus.PENDING),
        ("action_required", PixStatus.PENDING),
        ("processing", PixStatus.PENDING),
        ("canceled", PixStatus.CANCELLED),
        ("failed", PixStatus.CANCELLED),
        ("refunded", PixStatus.CANCELLED),
        ("charged_back", PixStatus.CANCELLED),
        ("", PixStatus.PENDING),
    ],
)
def test_status_mapping(raw: str, expected: PixStatus) -> None:
    assert mercadopago_status(raw) == expected


class StubOrders:
    """Stands in for `sdk.order()`: records the call and answers what the test set."""

    def __init__(
        self, create_result: dict[str, Any] | None = None, get_result: dict[str, Any] | None = None
    ):
        self.create_result = create_result
        self.get_result = get_result
        self.created: list[tuple[dict[str, Any], Any]] = []
        self.fetched: list[str] = []

    def create(self, body: dict[str, Any], request_options: Any = None) -> dict[str, Any]:
        self.created.append((body, request_options))
        assert self.create_result is not None
        return self.create_result

    def get(self, order_id: str, request_options: Any = None) -> dict[str, Any]:
        self.fetched.append(order_id)
        assert self.get_result is not None
        return self.get_result


class StubSdk:
    def __init__(self, orders: StubOrders) -> None:
        self._orders = orders

    def order(self) -> StubOrders:
        return self._orders


def _order_response(
    order_id: str = "ORD01ABC", qr_code: str | None = "00020126...MAVVA"
) -> dict[str, Any]:
    method: dict[str, Any] = {"id": "pix", "type": "bank_transfer"}
    if qr_code is not None:
        method["qr_code"] = qr_code
        method["qr_code_base64"] = ""
        method["ticket_url"] = "https://www.mercadopago.com.br/payments/1/ticket"
    return {
        "status": 201,
        "response": {
            "id": order_id,
            "status": "action_required",
            "status_detail": "waiting_transfer",
            "transactions": {
                "payments": [
                    {"id": "PAY01XYZ", "status": "action_required", "payment_method": method}
                ]
            },
        },
    }


class TestMercadoPagoCharge:
    def test_creates_a_pix_order_and_reads_the_code(self) -> None:
        orders = StubOrders(create_result=_order_response())
        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(orders))
        charge = provider.create_charge(
            amount_cents=1250,
            description="Apoio",
            payer_email="a@b.c",
            payer_name="Samuel Silva",
            reference="ref-1",
        )

        body, options = orders.created[0]
        assert body["type"] == "online"
        assert body["total_amount"] == "12.50"
        assert body["external_reference"] == "ref-1"
        assert body["processing_mode"] == "automatic"
        payment = body["transactions"]["payments"][0]
        assert payment["amount"] == "12.50"
        assert payment["payment_method"] == {"id": "pix", "type": "bank_transfer"}
        assert payment["expiration_time"] == "PT30M"
        assert body["payer"] == {"email": "a@b.c", "first_name": "Samuel"}
        assert options.custom_headers == {"x-idempotency-key": "ref-1"}
        assert charge.provider == "mercadopago"
        assert charge.provider_payment_id == "ORD01ABC"
        assert charge.qr_code == "00020126...MAVVA"
        assert charge.ticket_url is not None and charge.ticket_url.endswith("/ticket")

    def test_sandbox_auto_approve_sends_the_magic_payer_name(self) -> None:
        orders = StubOrders(create_result=_order_response())
        provider = MercadoPagoPix("APP_USR-test", sandbox_auto_approve=True, sdk=StubSdk(orders))
        provider.create_charge(
            amount_cents=500,
            description="Apoio",
            payer_email="a@b.c",
            payer_name="Ana",
            reference="r",
        )
        assert orders.created[0][0]["payer"]["first_name"] == "APRO"

    def test_amounts_keep_two_decimals(self) -> None:
        orders = StubOrders(create_result=_order_response())
        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(orders))
        provider.create_charge(
            amount_cents=100_000,
            description="Apoio",
            payer_email="a@b.c",
            payer_name="Ana",
            reference="r",
        )
        assert orders.created[0][0]["total_amount"] == "1000.00"

    def test_refusals_become_provider_errors(self) -> None:
        orders = StubOrders(create_result={"status": 400, "response": {"message": "bad"}})
        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(orders))
        with pytest.raises(PixProviderError):
            provider.create_charge(
                amount_cents=500,
                description="Apoio",
                payer_email="a@b.c",
                payer_name="Ana",
                reference="r",
            )

    def test_sdk_exceptions_become_provider_errors(self) -> None:
        class Exploding(StubOrders):
            def create(self, body: dict[str, Any], request_options: Any = None) -> dict[str, Any]:
                raise RuntimeError("connection reset")

        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(Exploding()))
        with pytest.raises(PixProviderError):
            provider.create_charge(
                amount_cents=500,
                description="Apoio",
                payer_email="a@b.c",
                payer_name="Ana",
                reference="r",
            )

    def test_answer_without_code_is_an_error(self) -> None:
        orders = StubOrders(create_result=_order_response(qr_code=None))
        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(orders))
        with pytest.raises(PixProviderError):
            provider.create_charge(
                amount_cents=500,
                description="Apoio",
                payer_email="a@b.c",
                payer_name="Ana",
                reference="r",
            )

    def test_fetch_status_maps_the_order_status(self) -> None:
        orders = StubOrders(
            get_result={
                "status": 200,
                "response": {
                    "id": "ORD01ABC",
                    "status": "processed",
                    "status_detail": "accredited",
                },
            }
        )
        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(orders))
        assert provider.fetch_status("ORD01ABC") == PixStatus.APPROVED
        assert orders.fetched == ["ORD01ABC"]

    def test_fetch_status_failure_is_a_provider_error(self) -> None:
        orders = StubOrders(get_result={"status": 404, "response": {"message": "not found"}})
        provider = MercadoPagoPix("APP_USR-test", sdk=StubSdk(orders))
        with pytest.raises(PixProviderError):
            provider.fetch_status("ORD-missing")


def test_fake_provider_only_settles_when_told() -> None:
    provider = FakePix()
    charge = provider.create_charge(
        amount_cents=1000, description="Apoio", payer_email="a@b.c", payer_name="Ana", reference="r"
    )
    assert charge.provider == "fake"
    assert charge.qr_code.startswith("000201")
    assert provider.fetch_status(charge.provider_payment_id) == PixStatus.PENDING
    provider.approve(charge.provider_payment_id)
    assert provider.fetch_status(charge.provider_payment_id) == PixStatus.APPROVED

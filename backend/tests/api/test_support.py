"""Apoie o Mavva: Pix charges, polling, the webhook and the supporter status."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1 import support as support_api
from app.models import SupportPayment, User
from app.services.pix_provider import FakePix, PixProviderError, PixStatus
from tests.helpers import register_and_login


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client: TestClient, email: str = "samuel@teste.com") -> dict[str, str]:
    return _auth(register_and_login(client, email=email)["access_token"])


def _create(client: TestClient, headers: dict[str, str], amount_cents: int = 1000) -> dict:
    response = client.post(
        "/api/v1/support/payments", json={"amount_cents": amount_cents}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestCreateCharge:
    def test_issues_a_pending_pix(self, client: TestClient) -> None:
        headers = _login(client)
        payment = _create(client, headers, 2000)
        assert payment["status"] == "pending"
        assert payment["amount_cents"] == 2000
        assert payment["provider"] == "fake"
        assert payment["qr_code"].startswith("000201")
        assert payment["approved_at"] is None
        expires = datetime.fromisoformat(payment["expires_at"])
        assert expires > datetime.now(UTC) + timedelta(minutes=20)

    @pytest.mark.parametrize("amount", [0, 499, -5])
    def test_amount_bounds(self, client: TestClient, amount: int) -> None:
        headers = _login(client)
        response = client.post(
            "/api/v1/support/payments", json={"amount_cents": amount}, headers=headers
        )
        assert response.status_code == 422

    def test_provider_failure_is_a_502(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class Broken:
            name = "broken"

            def create_charge(self, **kwargs: Any) -> None:
                raise PixProviderError

            def fetch_status(self, provider_payment_id: str) -> PixStatus:
                return PixStatus.PENDING

        monkeypatch.setattr(support_api, "get_pix_provider", lambda: Broken())
        headers = _login(client)
        response = client.post(
            "/api/v1/support/payments", json={"amount_cents": 500}, headers=headers
        )
        assert response.status_code == 502
        assert "Pix" in response.json()["detail"]

    def test_production_without_credentials_refuses_instead_of_faking(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.services import pix_provider

        real = pix_provider.get_settings()
        monkeypatch.setattr(
            pix_provider,
            "get_settings",
            lambda: real.model_copy(update={"environment": "production"}),
        )
        headers = _login(client)
        response = client.post(
            "/api/v1/support/payments", json={"amount_cents": 500}, headers=headers
        )
        assert response.status_code == 502
        # The summary still answers, just without asking the provider.
        assert client.get("/api/v1/support/me", headers=headers).status_code == 200

    def test_summary_survives_a_provider_outage(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        headers = _login(client)
        payment = _create(client, headers)

        def down() -> None:
            raise PixProviderError

        monkeypatch.setattr(support_api, "get_pix_provider", down)
        response = client.get("/api/v1/support/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["last_payment"]["id"] == payment["id"]
        assert response.json()["last_payment"]["status"] == "pending"

    def test_requires_login(self, client: TestClient) -> None:
        assert (
            client.post("/api/v1/support/payments", json={"amount_cents": 500}).status_code == 401
        )


class TestFollowTheCharge:
    def test_polling_keeps_pending_until_paid(self, client: TestClient) -> None:
        headers = _login(client)
        payment = _create(client, headers)
        status = client.get(f"/api/v1/support/payments/{payment['id']}", headers=headers)
        assert status.status_code == 200
        assert status.json()["status"] == "pending"

    def test_simulated_payment_crowns_the_supporter(self, client: TestClient, db: Session) -> None:
        headers = _login(client)
        assert client.get("/api/v1/users/me", headers=headers).json()["is_supporter"] is False

        payment = _create(client, headers, 1500)
        approved = client.post(
            f"/api/v1/support/payments/{payment['id']}/simulate", headers=headers
        )
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"
        assert approved.json()["approved_at"] is not None

        me = client.get("/api/v1/users/me", headers=headers).json()
        assert me["is_supporter"] is True
        assert me["supporter_since"] is not None
        until = datetime.fromisoformat(me["supporter_until"])
        assert timedelta(days=29) < until - datetime.now(UTC) <= timedelta(days=30)
        assert approved.json()["supporter_days"] == 30
        # The badge travels with the public profile too (HUD card, ranking).
        profile = client.get(f"/api/v1/players/{me['id']}", headers=headers).json()
        assert profile["user"]["is_supporter"] is True

        summary = client.get("/api/v1/support/me", headers=headers).json()
        assert summary["is_supporter"] is True
        assert summary["total_cents"] == 1500
        assert summary["last_payment"]["id"] == payment["id"]

    def test_second_donation_keeps_the_first_date(self, client: TestClient, db: Session) -> None:
        headers = _login(client)
        first = _create(client, headers, 500)
        client.post(f"/api/v1/support/payments/{first['id']}/simulate", headers=headers)
        since = client.get("/api/v1/users/me", headers=headers).json()["supporter_since"]

        second = _create(client, headers, 700)
        client.post(f"/api/v1/support/payments/{second['id']}/simulate", headers=headers)
        me = client.get("/api/v1/users/me", headers=headers).json()
        assert me["supporter_since"] == since
        summary = client.get("/api/v1/support/me", headers=headers).json()
        assert summary["total_cents"] == 1200
        # Two R$ 30-or-less donations stack to 60 days.
        until = datetime.fromisoformat(summary["supporter_until"])
        assert timedelta(days=59) < until - datetime.now(UTC) <= timedelta(days=60)

    def test_bigger_donations_buy_more_days(self, client: TestClient) -> None:
        headers = _login(client)
        payment = _create(client, headers, 3100)
        approved = client.post(
            f"/api/v1/support/payments/{payment['id']}/simulate", headers=headers
        )
        assert approved.json()["supporter_days"] == 60
        until = datetime.fromisoformat(
            client.get("/api/v1/users/me", headers=headers).json()["supporter_until"]
        )
        assert timedelta(days=59) < until - datetime.now(UTC) <= timedelta(days=60)

    def test_an_expired_badge_restarts_from_today(self, client: TestClient, db: Session) -> None:
        headers = _login(client)
        me = client.get("/api/v1/users/me", headers=headers).json()
        user = db.get(User, me["id"])
        assert user is not None
        user.supporter_since = datetime.now(UTC) - timedelta(days=90)
        user.supporter_until = datetime.now(UTC) - timedelta(days=60)
        db.flush()
        assert client.get("/api/v1/users/me", headers=headers).json()["is_supporter"] is False

        payment = _create(client, headers, 500)
        client.post(f"/api/v1/support/payments/{payment['id']}/simulate", headers=headers)
        me = client.get("/api/v1/users/me", headers=headers).json()
        assert me["is_supporter"] is True
        until = datetime.fromisoformat(me["supporter_until"])
        assert timedelta(days=29) < until - datetime.now(UTC) <= timedelta(days=30)

    def test_simulation_is_hidden_in_production(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        headers = _login(client)
        payment = _create(client, headers)
        real = support_api.get_settings()
        monkeypatch.setattr(
            support_api,
            "get_settings",
            lambda: real.model_copy(update={"environment": "production"}),
        )
        response = client.post(
            f"/api/v1/support/payments/{payment['id']}/simulate", headers=headers
        )
        assert response.status_code == 404

    def test_expired_code_is_marked_without_asking_the_provider(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        headers = _login(client)
        payment = _create(client, headers)
        row = db.get(SupportPayment, payment["id"])
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.flush()

        def never(provider_payment_id: str) -> PixStatus:
            raise AssertionError("expired charges must not hit the provider")

        monkeypatch.setattr(FakePix, "fetch_status", lambda self, pid: never(pid))
        status = client.get(f"/api/v1/support/payments/{payment['id']}", headers=headers)
        assert status.json()["status"] == "expired"
        assert client.get("/api/v1/users/me", headers=headers).json()["is_supporter"] is False

    def test_only_the_owner_sees_a_charge(self, client: TestClient) -> None:
        mine = _login(client)
        payment = _create(client, mine)
        other = _login(client, email="maria@teste.com")
        assert (
            client.get(f"/api/v1/support/payments/{payment['id']}", headers=other).status_code
            == 404
        )
        assert (
            client.post(
                f"/api/v1/support/payments/{payment['id']}/simulate", headers=other
            ).status_code
            == 404
        )

    def test_summary_resumes_the_pending_charge(self, client: TestClient) -> None:
        headers = _login(client)
        empty = client.get("/api/v1/support/me", headers=headers).json()
        assert empty == {
            "is_supporter": False,
            "supporter_since": None,
            "supporter_until": None,
            "total_cents": 0,
            "last_payment": None,
        }
        payment = _create(client, headers)
        summary = client.get("/api/v1/support/me", headers=headers).json()
        assert summary["last_payment"]["id"] == payment["id"]
        assert summary["last_payment"]["status"] == "pending"


class StubProvider:
    """Stands in for Mercado Pago: answers whatever status the test sets."""

    name = "mercadopago"

    def __init__(self, status: PixStatus) -> None:
        self.status = status
        self.calls: list[str] = []

    def create_charge(self, **kwargs: Any) -> None:
        raise AssertionError("webhook tests never create charges through the stub")

    def fetch_status(self, provider_payment_id: str) -> PixStatus:
        self.calls.append(provider_payment_id)
        return self.status


class TestWebhook:
    URL = "/api/v1/support/webhooks/mercadopago"

    def _pending(self, client: TestClient, db: Session) -> tuple[dict[str, str], SupportPayment]:
        headers = _login(client)
        payment = _create(client, headers)
        row = db.get(SupportPayment, payment["id"])
        assert row is not None
        return headers, row

    def test_unknown_payment_is_acknowledged(self, client: TestClient) -> None:
        response = client.post(f"{self.URL}?data.id=999&type=payment", json={"data": {"id": "999"}})
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    def test_approval_comes_from_the_provider_not_the_call(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        headers, row = self._pending(client, db)
        stub = StubProvider(PixStatus.APPROVED)
        monkeypatch.setattr(support_api, "get_pix_provider", lambda: stub)

        response = client.post(
            f"{self.URL}?data.id={row.provider_payment_id}&type=payment",
            json={
                "action": "payment.updated",
                "type": "payment",
                "data": {"id": row.provider_payment_id},
            },
        )
        assert response.status_code == 200
        assert stub.calls == [row.provider_payment_id]
        db.refresh(row)
        assert row.status.value == "approved"
        assert client.get("/api/v1/users/me", headers=headers).json()["is_supporter"] is True

    def test_body_id_is_enough_when_the_query_is_missing(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _, row = self._pending(client, db)
        monkeypatch.setattr(
            support_api, "get_pix_provider", lambda: StubProvider(PixStatus.CANCELLED)
        )
        client.post(self.URL, json={"data": {"id": row.provider_payment_id}})
        db.refresh(row)
        assert row.status.value == "cancelled"

    def test_a_call_that_says_nothing_new_changes_nothing(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        headers, row = self._pending(client, db)
        monkeypatch.setattr(
            support_api, "get_pix_provider", lambda: StubProvider(PixStatus.PENDING)
        )
        client.post(f"{self.URL}?data.id={row.provider_payment_id}")
        db.refresh(row)
        assert row.status.value == "pending"
        assert client.get("/api/v1/users/me", headers=headers).json()["is_supporter"] is False

    def test_signature_is_enforced_when_a_secret_is_set(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _, row = self._pending(client, db)
        real = support_api.get_settings()
        monkeypatch.setattr(
            support_api,
            "get_settings",
            lambda: real.model_copy(update={"mercadopago_webhook_secret": "s3cr3t"}),
        )
        monkeypatch.setattr(
            support_api, "get_pix_provider", lambda: StubProvider(PixStatus.APPROVED)
        )

        forged = client.post(
            f"{self.URL}?data.id={row.provider_payment_id}",
            headers={"x-signature": "ts=1,v1=deadbeef", "x-request-id": "r"},
        )
        assert forged.status_code == 401
        db.refresh(row)
        assert row.status.value == "pending"

        import hashlib
        import hmac

        manifest = f"id:{row.provider_payment_id};request-id:req-9;ts:1700000000000;"
        digest = hmac.new(b"s3cr3t", manifest.encode(), hashlib.sha256).hexdigest()
        signed = client.post(
            f"{self.URL}?data.id={row.provider_payment_id}",
            headers={"x-signature": f"ts=1700000000000,v1={digest}", "x-request-id": "req-9"},
        )
        assert signed.status_code == 200
        db.refresh(row)
        assert row.status.value == "approved"

    def test_provider_outage_asks_for_a_retry(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _, row = self._pending(client, db)

        class Down(StubProvider):
            def fetch_status(self, provider_payment_id: str) -> PixStatus:
                raise PixProviderError

        monkeypatch.setattr(support_api, "get_pix_provider", lambda: Down(PixStatus.PENDING))
        response = client.post(f"{self.URL}?data.id={row.provider_payment_id}")
        assert response.status_code == 503


class TestAdminOverview:
    URL = "/api/v1/admin/support"

    def _admin(self, client: TestClient, db: Session) -> dict[str, str]:
        from app.models.enums import UserRole

        body = register_and_login(client, name="Admin", email="admin@teste.com")
        user = db.get(User, body["user"]["id"])
        assert user is not None
        user.role = UserRole.ADMIN
        db.flush()
        return _auth(body["access_token"])

    def test_regular_users_are_forbidden(self, client: TestClient) -> None:
        headers = _login(client)
        assert client.get(self.URL, headers=headers).status_code == 403

    def test_totals_per_player_and_recent_charges(self, client: TestClient, db: Session) -> None:
        admin = self._admin(client, db)
        maria = _login(client, email="maria@teste.com")
        first = _create(client, maria, 1000)
        client.post(f"/api/v1/support/payments/{first['id']}/simulate", headers=maria)
        second = _create(client, maria, 500)
        client.post(f"/api/v1/support/payments/{second['id']}/simulate", headers=maria)
        _create(client, maria, 700)  # still pending
        joao = _login(client, email="joao@teste.com")
        paid = _create(client, joao, 3100)
        client.post(f"/api/v1/support/payments/{paid['id']}/simulate", headers=joao)

        response = client.get(self.URL, headers=admin)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["total_cents"] == 4600
        assert body["approved_count"] == 3
        assert body["pending_count"] == 1
        assert body["active_supporters"] == 2
        assert [d["username"] for d in body["donors"]] == [
            d["username"] for d in sorted(body["donors"], key=lambda d: -d["total_cents"])
        ]
        top = body["donors"][0]
        assert top["total_cents"] == 3100 and top["donations"] == 1 and top["is_supporter"]
        maria_row = next(d for d in body["donors"] if d["total_cents"] == 1500)
        assert maria_row["donations"] == 2
        assert len(body["recent"]) == 4
        assert body["recent"][0]["status"] == "approved"
        assert {p["status"] for p in body["recent"]} == {"approved", "pending"}

    def test_empty_overview(self, client: TestClient, db: Session) -> None:
        admin = self._admin(client, db)
        body = client.get(self.URL, headers=admin).json()
        assert body == {
            "total_cents": 0,
            "approved_count": 0,
            "pending_count": 0,
            "active_supporters": 0,
            "donors": [],
            "recent": [],
        }


def test_user_model_exposes_supporter_flag(db: Session) -> None:
    user = User(email="x@y.z", username="xyz", name="X", hashed_password="h")
    assert user.is_supporter is False
    user.supporter_since = datetime.now(UTC)
    user.supporter_until = datetime.now(UTC) + timedelta(days=1)
    assert user.is_supporter is True
    user.supporter_until = datetime.now(UTC) - timedelta(seconds=1)
    assert user.is_supporter is False


@pytest.mark.parametrize(
    ("cents", "days"),
    [
        (100, 30),
        (1000, 30),
        (3000, 30),
        (3001, 60),
        (3100, 60),
        (6000, 60),
        (6001, 90),
        (100_000, 1020),
    ],
)
def test_supporter_days_tiers(cents: int, days: int) -> None:
    from app.services.support_service import supporter_days

    assert supporter_days(cents) == days


class TestSupporterMonths:
    """The number on the seal: which month of support the player is in."""

    def _user(self, client: TestClient, db: Session, headers: dict[str, str]) -> User:
        user = db.get(User, client.get("/api/v1/users/me", headers=headers).json()["id"])
        assert user is not None
        return user

    def test_never_donated_is_zero(self, client: TestClient) -> None:
        headers = _login(client)
        assert client.get("/api/v1/users/me", headers=headers).json()["supporter_months"] == 0

    def test_first_donation_starts_month_one(self, client: TestClient, db: Session) -> None:
        headers = _login(client)
        payment = _create(client, headers, 9000)  # 90 days bought ahead
        client.post(f"/api/v1/support/payments/{payment['id']}/simulate", headers=headers)
        me = client.get("/api/v1/users/me", headers=headers).json()
        # Days bought ahead don't count until they are lived.
        assert me["supporter_months"] == 1
        assert self._user(client, db, headers).supporter_days_total == 90
        profile = client.get(f"/api/v1/players/{me['id']}", headers=headers).json()
        assert profile["user"]["supporter_months"] == 1

    def test_months_count_as_they_are_lived(self, client: TestClient, db: Session) -> None:
        headers = _login(client)
        user = self._user(client, db, headers)
        now = datetime.now(UTC)
        user.supporter_since = now - timedelta(days=45)
        user.supporter_days_total = 90
        user.supporter_until = now + timedelta(days=45)  # 45 of the 90 days lived
        db.flush()
        assert client.get("/api/v1/users/me", headers=headers).json()["supporter_months"] == 2

    def test_a_gap_between_months_does_not_count(self, client: TestClient, db: Session) -> None:
        headers = _login(client)
        user = self._user(client, db, headers)
        now = datetime.now(UTC)
        # One month lived long ago, lapsed since: still one month of support.
        user.supporter_since = now - timedelta(days=200)
        user.supporter_days_total = 30
        user.supporter_until = now - timedelta(days=170)
        db.flush()
        me = client.get("/api/v1/users/me", headers=headers).json()
        assert me["is_supporter"] is False
        assert me["supporter_months"] == 1
        # While the seal is off, others see no number.
        profile = client.get(f"/api/v1/players/{me['id']}", headers=headers).json()
        assert profile["user"]["supporter_months"] == 0

        # Coming back starts the second month, not the eighth.
        payment = _create(client, headers, 500)
        client.post(f"/api/v1/support/payments/{payment['id']}/simulate", headers=headers)
        assert client.get("/api/v1/users/me", headers=headers).json()["supporter_months"] == 2

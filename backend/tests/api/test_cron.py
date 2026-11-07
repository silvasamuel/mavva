import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services import email_service
from tests.api.test_moderation import _draft
from tests.factories import make_category

SECRET = "cron-secret-for-tests"
DIGEST = "/api/v1/cron/review-digest"


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, str]]:
    settings = get_settings()
    monkeypatch.setattr(settings, "cron_secret", SECRET)
    monkeypatch.setattr(settings, "admin_digest_email", "admin@teste.com")
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    outbox: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email_service, "deliver", lambda to, subject, body: outbox.append((to, subject, body))
    )
    return outbox


def _bearer(token: str = SECRET) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class TestReviewDigest:
    def test_disabled_without_a_secret(self, client: TestClient):
        assert client.get(DIGEST, headers=_bearer()).status_code == 404

    def test_rejects_a_wrong_secret(self, client: TestClient, sent: list):
        assert client.get(DIGEST).status_code == 401
        assert client.get(DIGEST, headers=_bearer("errado")).status_code == 401
        assert sent == []

    def test_stays_quiet_when_nothing_is_pending(self, client: TestClient, sent: list):
        response = client.get(DIGEST, headers=_bearer())
        assert response.status_code == 200
        assert response.json() == {"sent": False, "questions": 0, "features": 0, "corrections": 0}
        assert sent == []

    def test_mails_the_pending_counts(
        self, auth_client: TestClient, client: TestClient, db: Session, sent: list
    ):
        auth_client.post("/api/v1/proposals", json=_draft(make_category(db).id))
        for kind in ("feature", "feature", "correction"):
            auth_client.post(
                "/api/v1/suggestions",
                json={"kind": kind, "body": "Uma sugestão com texto suficiente."},
            )

        response = client.get(DIGEST, headers=_bearer())
        assert response.json() == {"sent": True, "questions": 1, "features": 2, "corrections": 1}
        [(to, subject, body)] = sent
        assert to == "admin@teste.com"
        assert "revisão" in subject
        assert "Novas funcionalidades" in body
        assert "(2 novas)" in body
        assert f"{get_settings().public_origin}/admin" in body

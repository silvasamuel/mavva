from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Friendship, User
from tests.helpers import register_and_login


def _register(client: TestClient, email: str, name: str = "Jogador") -> dict:
    return register_and_login(client, name=name, email=email)


class TestReviewPreferences:
    def test_defaults_and_patch(self, auth_client: TestClient):
        me = auth_client.get("/api/v1/users/me").json()
        assert me["review_spacing"] == "balanced"
        assert me["review_scope"] == "all"
        assert me["review_order"] == "oldest"
        assert me["review_session_size"] == 10
        assert me["review_max_interval_days"] is None

        saved = auth_client.patch(
            "/api/v1/users/me",
            json={
                "review_spacing": "intensive",
                "review_scope": "mistakes",
                "review_order": "lapses",
                "review_session_size": 5,
                "review_max_interval_days": 30,
            },
        )
        assert saved.status_code == 200, saved.text
        body = saved.json()
        assert body["review_spacing"] == "intensive"
        assert body["review_session_size"] == 5
        assert body["review_max_interval_days"] == 30

        cleared = auth_client.patch("/api/v1/users/me", json={"review_max_interval_days": None})
        assert cleared.status_code == 200
        assert cleared.json()["review_max_interval_days"] is None
        assert cleared.json()["review_spacing"] == "intensive"

    def test_rejects_unknown_session_size(self, auth_client: TestClient):
        response = auth_client.patch("/api/v1/users/me", json={"review_session_size": 7})
        assert response.status_code == 400


class TestAccountExportRemoved:
    """Self-service export moved to the admin panel — see test_admin.py's
    TestAdminUserExport. The route should no longer answer here at all."""

    def test_self_service_export_route_is_gone(self, auth_client: TestClient):
        assert auth_client.get("/api/v1/users/me/export").status_code == 404


class TestAccountDelete:
    def test_wrong_password_keeps_the_account(self, auth_client: TestClient, db: Session):
        response = auth_client.request(
            "DELETE", "/api/v1/users/me", json={"password": "senha-errada"}
        )
        assert response.status_code == 403
        assert db.scalar(select(User).where(User.email == "samuel@teste.com")) is not None

    def test_delete_removes_the_user_and_frees_the_email(
        self, auth_client: TestClient, db: Session
    ):
        response = auth_client.request(
            "DELETE", "/api/v1/users/me", json={"password": "senha-forte-123"}
        )
        assert response.status_code == 204
        assert db.scalar(select(User).where(User.email == "samuel@teste.com")) is None
        assert auth_client.get("/api/v1/users/me").status_code == 401

        again = _register(auth_client, "samuel@teste.com")
        assert again["user"]["email"] == "samuel@teste.com"

    def test_delete_cascades_friendships(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        other = _register(client, "maria@teste.com", "Maria")
        sent = auth_client.post("/api/v1/friends/requests", json={"username": "maria"})
        assert sent.status_code == 201
        incoming = client.get(
            "/api/v1/friends", headers={"Authorization": f"Bearer {other['access_token']}"}
        ).json()["incoming"]
        client.post(
            f"/api/v1/friends/requests/{incoming[0]['id']}/accept",
            headers={"Authorization": f"Bearer {other['access_token']}"},
        )

        assert (
            auth_client.request(
                "DELETE", "/api/v1/users/me", json={"password": "senha-forte-123"}
            ).status_code
            == 204
        )
        assert db.scalar(select(Friendship)) is None
        leftover = client.get(
            "/api/v1/friends", headers={"Authorization": f"Bearer {other['access_token']}"}
        )
        assert leftover.status_code == 200
        assert leftover.json()["friends"] == []

    def test_delete_requires_auth(self, client: TestClient):
        response = client.request(
            "DELETE", "/api/v1/users/me", json={"password": "senha-forte-123"}
        )
        assert response.status_code == 401

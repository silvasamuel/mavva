from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Friendship, User
from tests.helpers import register_and_login


def _register(client: TestClient, email: str, name: str = "Jogador") -> dict:
    return register_and_login(client, name=name, email=email)


class TestAccountExport:
    def test_export_includes_profile_and_omits_secrets(self, auth_client: TestClient):
        data = auth_client.get("/api/v1/users/me/export").json()
        assert data["user"]["email"] == "samuel@teste.com"
        assert data["user"]["terms_version"] == "2026-09-16"
        assert "hashed_password" not in data["user"]
        assert "password" not in data["user"]
        assert data["stats"]["level"] == 1
        assert data["quiz_sessions"] == []
        assert "exported_at" in data

    def test_export_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/users/me/export").status_code == 401

    def test_export_waits_before_another_download(self, auth_client: TestClient, db: Session):
        assert auth_client.get("/api/v1/users/me/export").status_code == 200
        blocked = auth_client.get("/api/v1/users/me/export")
        assert blocked.status_code == 429
        assert blocked.headers.get("retry-after")
        assert "tente de novo" in blocked.json()["detail"].lower()

        user = db.scalar(select(User).where(User.email == "samuel@teste.com"))
        assert user is not None
        user.last_data_export_at = datetime.now(UTC) - timedelta(hours=7)
        db.flush()
        assert auth_client.get("/api/v1/users/me/export").status_code == 200


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

        assert auth_client.request(
            "DELETE", "/api/v1/users/me", json={"password": "senha-forte-123"}
        ).status_code == 204
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

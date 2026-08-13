from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.models import User
from app.services.auth_service import register_user
from tests.helpers import register_and_login, verification_tokens
from tests.helpers import register_user as api_register


def _register(client: TestClient, email: str = "novo@teste.com") -> dict:
    return api_register(client, name="Novo Usuário", email=email)


class TestRegister:
    def test_register_asks_for_email_confirmation(self, client: TestClient):
        body = _register(client)
        assert "access_token" not in body
        assert "confirmação" in body["message"].lower()
        assert client.cookies.get("refresh_token") is None
        assert verification_tokens["novo@teste.com"]

    def test_duplicate_email_conflicts(self, client: TestClient):
        _register(client)
        response = client.post(
            "/api/v1/auth/register",
            json={"name": "Outro", "email": "NOVO@teste.com", "password": "senha-forte-123"},
        )
        assert response.status_code == 409

    def test_short_password_rejected(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/register",
            json={"name": "Novo", "email": "x@teste.com", "password": "curta"},
        )
        assert response.status_code == 422


class TestVerifyEmail:
    def test_verify_issues_tokens_and_allows_login(self, client: TestClient):
        _register(client)
        response = client.post(
            "/api/v1/auth/verify-email", json={"token": verification_tokens["novo@teste.com"]}
        )
        assert response.status_code == 200
        assert response.json()["access_token"]
        assert response.json()["user"]["email"] == "novo@teste.com"
        assert client.cookies.get("refresh_token")

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-forte-123"},
        )
        assert login.status_code == 200

    def test_verify_token_is_single_use(self, client: TestClient):
        _register(client)
        token = verification_tokens["novo@teste.com"]
        assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
        assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400

    def test_invalid_token_is_400(self, client: TestClient):
        assert (
            client.post("/api/v1/auth/verify-email", json={"token": "nao-existe"}).status_code
            == 400
        )


class TestResendVerification:
    def test_never_reveals_account_existence(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/resend-verification", json={"email": "nao-existe@teste.com"}
        )
        assert response.status_code == 202

    def test_issues_a_new_token(self, client: TestClient):
        _register(client)
        first = verification_tokens["novo@teste.com"]
        assert (
            client.post(
                "/api/v1/auth/resend-verification", json={"email": "novo@teste.com"}
            ).status_code
            == 202
        )
        second = verification_tokens["novo@teste.com"]
        assert second != first
        assert client.post("/api/v1/auth/verify-email", json={"token": first}).status_code == 400
        assert client.post("/api/v1/auth/verify-email", json={"token": second}).status_code == 200


class TestLogin:
    def test_login_success(self, client: TestClient):
        register_and_login(client, name="Novo Usuário", email="novo@teste.com")
        client.cookies.clear()
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-forte-123"},
        )
        assert response.status_code == 200
        assert response.json()["access_token"]

    def test_unverified_login_is_403(self, client: TestClient):
        _register(client)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-forte-123"},
        )
        assert response.status_code == 403
        assert "e-mail" in response.json()["detail"].lower()

    def test_wrong_password_is_401_even_if_unverified(self, client: TestClient):
        _register(client)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-errada-123"},
        )
        assert response.status_code == 401

    def test_unverified_access_token_is_rejected(self, client: TestClient, db):
        user = register_user(db, "Novo", "api@teste.com", "senha-forte-123")
        db.flush()
        token = create_access_token(user.id)
        response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403

    def test_inactive_login_is_403(self, client: TestClient, db):
        register_and_login(client, name="Novo Usuário", email="novo@teste.com")
        user = db.query(User).filter(User.email == "novo@teste.com").one()
        user.is_active = False
        db.flush()
        client.cookies.clear()
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-forte-123"},
        )
        assert response.status_code == 403
        assert "inativa" in response.json()["detail"].lower()


class TestRefreshRotation:
    def test_refresh_returns_new_access_token(self, client: TestClient):
        register_and_login(client, name="Novo Usuário", email="novo@teste.com")
        response = client.post("/api/v1/auth/refresh")
        assert response.status_code == 200
        assert response.json()["access_token"]

    def test_reusing_rotated_token_revokes_family(self, client: TestClient):
        register_and_login(client, name="Novo Usuário", email="novo@teste.com")
        old_cookie = client.cookies.get("refresh_token")

        assert client.post("/api/v1/auth/refresh").status_code == 200
        new_cookie = client.cookies.get("refresh_token")
        assert new_cookie != old_cookie

        # Replay the stolen (already rotated) token.
        client.cookies.set("refresh_token", old_cookie)
        assert client.post("/api/v1/auth/refresh").status_code == 401

        # The whole family is dead — even the newest token no longer works.
        client.cookies.set("refresh_token", new_cookie)
        assert client.post("/api/v1/auth/refresh").status_code == 401

    def test_refresh_without_cookie_is_401(self, client: TestClient):
        assert client.post("/api/v1/auth/refresh").status_code == 401


class TestLogout:
    def test_logout_revokes_refresh(self, client: TestClient):
        register_and_login(client, name="Novo Usuário", email="novo@teste.com")
        cookie = client.cookies.get("refresh_token")
        assert client.post("/api/v1/auth/logout").status_code == 204
        client.cookies.set("refresh_token", cookie)
        assert client.post("/api/v1/auth/refresh").status_code == 401


class TestPasswordReset:
    def test_forgot_password_never_reveals_account_existence(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/forgot-password", json={"email": "nao-existe@teste.com"}
        )
        assert response.status_code == 202

    def test_full_reset_flow(self, client: TestClient, monkeypatch):
        captured: dict[str, str] = {}
        monkeypatch.setattr(
            "app.api.v1.auth.email_service.send_password_reset",
            lambda email, name, token: captured.update(token=token),
        )
        _register(client)
        client.post("/api/v1/auth/forgot-password", json={"email": "novo@teste.com"})
        assert captured["token"]

        response = client.post(
            "/api/v1/auth/reset-password",
            json={"token": captured["token"], "new_password": "nova-senha-456"},
        )
        assert response.status_code == 204

        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "novo@teste.com", "password": "nova-senha-456"},
            ).status_code
            == 200
        )

    def test_reset_token_is_single_use(self, client: TestClient, monkeypatch):
        captured: dict[str, str] = {}
        monkeypatch.setattr(
            "app.api.v1.auth.email_service.send_password_reset",
            lambda email, name, token: captured.update(token=token),
        )
        _register(client)
        client.post("/api/v1/auth/forgot-password", json={"email": "novo@teste.com"})
        first = client.post(
            "/api/v1/auth/reset-password",
            json={"token": captured["token"], "new_password": "nova-senha-456"},
        )
        assert first.status_code == 204
        second = client.post(
            "/api/v1/auth/reset-password",
            json={"token": captured["token"], "new_password": "outra-senha-789"},
        )
        assert second.status_code == 400

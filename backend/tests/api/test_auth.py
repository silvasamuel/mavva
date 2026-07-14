from fastapi.testclient import TestClient


def _register(client: TestClient, email: str = "novo@teste.com") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Novo Usuário", "email": email, "password": "senha-forte-123"},
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestRegister:
    def test_register_returns_token_and_user(self, client: TestClient):
        body = _register(client)
        assert body["access_token"]
        assert body["user"]["email"] == "novo@teste.com"

    def test_register_sets_refresh_cookie(self, client: TestClient):
        _register(client)
        assert client.cookies.get("refresh_token")

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


class TestLogin:
    def test_login_success(self, client: TestClient):
        _register(client)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-forte-123"},
        )
        assert response.status_code == 200
        assert response.json()["access_token"]

    def test_wrong_password_is_401(self, client: TestClient):
        _register(client)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "novo@teste.com", "password": "senha-errada-123"},
        )
        assert response.status_code == 401


class TestRefreshRotation:
    def test_refresh_returns_new_access_token(self, client: TestClient):
        _register(client)
        response = client.post("/api/v1/auth/refresh")
        assert response.status_code == 200
        assert response.json()["access_token"]

    def test_reusing_rotated_token_revokes_family(self, client: TestClient):
        _register(client)
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
        _register(client)
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

    def test_full_reset_flow(self, client: TestClient, db, monkeypatch):
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

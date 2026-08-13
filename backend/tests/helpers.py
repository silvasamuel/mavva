from fastapi.testclient import TestClient

verification_tokens: dict[str, str] = {}


def register_user(
    client: TestClient,
    *,
    name: str = "Samuel Teste",
    email: str = "samuel@teste.com",
    password: str = "senha-forte-123",
) -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert response.status_code == 201, response.text
    return response.json()


def register_and_login(
    client: TestClient,
    *,
    name: str = "Samuel Teste",
    email: str = "samuel@teste.com",
    password: str = "senha-forte-123",
) -> dict:
    register_user(client, name=name, email=email, password=password)
    token = verification_tokens[email.strip().lower()]
    verified = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verified.status_code == 200, verified.text
    return verified.json()

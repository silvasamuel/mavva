from starlette.requests import Request

from app.core.ratelimit import client_ip


def _request(*, forwarded: str | None = None, client: str = "127.0.0.1") -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": headers,
            "client": (client, 123),
            "server": ("test", 80),
        }
    )


def test_production_uses_the_first_forwarded_ip(monkeypatch):
    monkeypatch.setattr(
        "app.core.ratelimit.get_settings",
        lambda: type("S", (), {"is_production": True})(),
    )
    request = _request(forwarded="203.0.113.10, 10.0.0.1")
    assert client_ip(request) == "203.0.113.10"


def test_development_ignores_forwarded_for(monkeypatch):
    monkeypatch.setattr(
        "app.core.ratelimit.get_settings",
        lambda: type("S", (), {"is_production": False})(),
    )
    request = _request(forwarded="203.0.113.10")
    assert client_ip(request) == "127.0.0.1"

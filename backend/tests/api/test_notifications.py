"""Announcements ("Novidades"): admin publishes, players read, the badge counts unread."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Announcement, User
from app.models.enums import UserRole


def _me(client: TestClient, db: Session) -> User:
    body = client.get("/api/v1/users/me").json()
    user = db.get(User, uuid.UUID(body["id"]))
    assert user is not None
    return user


def _make_admin(client: TestClient, db: Session) -> User:
    me = _me(client, db)
    me.role = UserRole.ADMIN
    db.flush()
    return me


def _announce(
    client: TestClient, *, title: str = "Duelos em grupo", published: bool = True
) -> dict:
    response = client.post(
        "/api/v1/admin/announcements",
        json={
            "title": title,
            "body": "Agora dá para\nduelar em trio.",
            "kind": "feature",
            "published": published,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _feed(client: TestClient) -> dict:
    response = client.get("/api/v1/notifications")
    assert response.status_code == 200, response.text
    return response.json()


def _badge(client: TestClient) -> int:
    return client.get("/api/v1/dashboard").json()["notifications_unread"]


class TestPlayerFeed:
    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/notifications").status_code == 401
        assert client.post("/api/v1/notifications/seen").status_code == 401

    def test_published_news_is_unread_until_the_player_opens_the_screen(
        self, auth_client: TestClient, db: Session
    ):
        _make_admin(auth_client, db)
        created = _announce(auth_client)

        feed = _feed(auth_client)
        assert feed["unread_count"] == 1
        assert _badge(auth_client) == 1
        item = feed["items"][0]
        assert item["id"] == created["id"]
        assert item["title"] == "Duelos em grupo"
        assert item["body"] == "Agora dá para\nduelar em trio."
        assert item["kind"] == "feature"
        assert item["unread"] is True

        assert auth_client.post("/api/v1/notifications/seen").status_code == 204

        feed = _feed(auth_client)
        assert feed["unread_count"] == 0
        assert feed["items"][0]["unread"] is False
        assert _badge(auth_client) == 0

    def test_drafts_stay_hidden(self, auth_client: TestClient, db: Session):
        _make_admin(auth_client, db)
        _announce(auth_client, published=False)
        assert _feed(auth_client) == {"items": [], "unread_count": 0}
        assert _badge(auth_client) == 0

    def test_news_from_before_signup_is_not_unread(self, auth_client: TestClient, db: Session):
        me = _make_admin(auth_client, db)
        _announce(auth_client)
        # pretend this player signed up after it was published
        me.created_at = datetime.now(UTC) + timedelta(minutes=1)
        db.flush()

        feed = _feed(auth_client)
        assert len(feed["items"]) == 1
        assert feed["unread_count"] == 0

    def test_newest_first(self, auth_client: TestClient, db: Session):
        _make_admin(auth_client, db)
        older = Announcement(
            title="Antiga",
            body="x",
            kind="notice",
            published_at=datetime.now(UTC) - timedelta(days=3),
        )
        db.add(older)
        db.flush()
        _announce(auth_client, title="Nova")
        assert [i["title"] for i in _feed(auth_client)["items"]] == ["Nova", "Antiga"]


class TestAdminAnnouncements:
    def test_players_cannot_manage_announcements(self, auth_client: TestClient):
        some_id = "00000000-0000-0000-0000-000000000001"
        for method, path in [
            ("get", "/api/v1/admin/announcements"),
            ("post", "/api/v1/admin/announcements"),
            ("patch", f"/api/v1/admin/announcements/{some_id}"),
            ("delete", f"/api/v1/admin/announcements/{some_id}"),
        ]:
            kwargs = {"json": {}} if method in ("post", "patch") else {}
            assert getattr(auth_client, method)(path, **kwargs).status_code == 403, path

    def test_draft_publish_edit_unpublish_delete(self, auth_client: TestClient, db: Session):
        _make_admin(auth_client, db)
        draft = _announce(auth_client, published=False)
        assert draft["published_at"] is None

        published = auth_client.patch(
            f"/api/v1/admin/announcements/{draft['id']}", json={"published": True}
        ).json()
        assert published["published_at"] is not None

        # fixing a typo keeps the publish time, so it doesn't come back as unread
        auth_client.post("/api/v1/notifications/seen")
        edited = auth_client.patch(
            f"/api/v1/admin/announcements/{draft['id']}",
            json={"title": "Duelos em trio", "kind": "improvement"},
        ).json()
        assert edited["title"] == "Duelos em trio"
        assert edited["kind"] == "improvement"
        assert edited["published_at"] == published["published_at"]
        assert _feed(auth_client)["unread_count"] == 0

        unpublished = auth_client.patch(
            f"/api/v1/admin/announcements/{draft['id']}", json={"published": False}
        ).json()
        assert unpublished["published_at"] is None
        assert _feed(auth_client)["items"] == []

        listed = auth_client.get("/api/v1/admin/announcements").json()
        assert [a["id"] for a in listed] == [draft["id"]]

        assert auth_client.delete(f"/api/v1/admin/announcements/{draft['id']}").status_code == 204
        assert auth_client.get("/api/v1/admin/announcements").json() == []
        assert auth_client.delete(f"/api/v1/admin/announcements/{draft['id']}").status_code == 404

    def test_validates_input(self, auth_client: TestClient, db: Session):
        _make_admin(auth_client, db)
        bad = [
            {"title": "   ", "body": "x", "kind": "feature"},
            {"title": "x", "body": "", "kind": "feature"},
            {"title": "x" * 121, "body": "x", "kind": "feature"},
            {"title": "x", "body": "x", "kind": "party"},
        ]
        for payload in bad:
            assert (
                auth_client.post("/api/v1/admin/announcements", json=payload).status_code == 422
            ), payload
        missing = auth_client.patch(
            "/api/v1/admin/announcements/00000000-0000-0000-0000-000000000001", json={"title": "x"}
        )
        assert missing.status_code == 404

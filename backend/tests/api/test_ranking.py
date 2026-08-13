import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Friendship, User, UserStats
from app.models.enums import FriendshipStatus


def _player(db: Session, username: str, xp: int) -> User:
    user = User(
        email=f"{username}@teste.com",
        username=username,
        name=username.title(),
        hashed_password="x",
    )
    user.stats = UserStats(total_xp=xp)
    db.add(user)
    db.flush()
    return user


def _me(auth_client: TestClient, db: Session) -> User:
    body = auth_client.get("/api/v1/users/me").json()
    user = db.get(User, uuid.UUID(body["id"]))
    assert user is not None
    return user


def _set_xp(db: Session, user: User, xp: int) -> None:
    stats = db.get(UserStats, user.id)
    assert stats is not None
    stats.total_xp = xp
    db.flush()


def _befriend(db: Session, a: User, b: User) -> None:
    db.add(Friendship(requester_id=a.id, addressee_id=b.id, status=FriendshipStatus.ACCEPTED))
    db.flush()


class TestGlobalRanking:
    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/ranking/global").status_code == 401

    def test_orders_by_xp_then_username(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 100)
        _player(db, "zeta", 300)
        _player(db, "ana", 200)
        _player(db, "bruno", 200)

        body = auth_client.get("/api/v1/ranking/global").json()
        names = [row["user"]["username"] for row in body["top"]]
        assert names == ["zeta", "ana", "bruno", "samuel"]
        assert [row["total_xp"] for row in body["top"]] == [300, 200, 200, 100]
        assert body["me"]["position"] == 4
        assert body["me"]["is_me"] is True
        assert body["total_players"] == 4
        assert "email" not in body["top"][0]["user"]

    def test_caps_top_at_ten_and_returns_me_apart(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 1)
        for index in range(10):
            _player(db, f"top{index:02d}", 1000 - index)

        body = auth_client.get("/api/v1/ranking/global").json()
        assert len(body["top"]) == 10
        names = [row["user"]["username"] for row in body["top"]]
        assert names == [f"top{i:02d}" for i in range(10)]
        assert not any(row["is_me"] for row in body["top"])
        assert body["me"]["user"]["username"] == "samuel"
        assert body["me"]["position"] == 11
        assert body["total_players"] == 11

    def test_me_inside_top_ten_is_flagged_in_the_list(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 500)
        _player(db, "abaixo", 10)

        body = auth_client.get("/api/v1/ranking/global").json()
        assert body["top"][0]["is_me"] is True
        assert body["me"]["position"] == 1

    def test_inactive_users_are_excluded(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 50)
        ghost = _player(db, "ghost", 900)
        ghost.is_active = False
        db.flush()

        body = auth_client.get("/api/v1/ranking/global").json()
        names = [row["user"]["username"] for row in body["top"]]
        assert "ghost" not in names
        assert body["total_players"] == 1
        assert body["me"]["position"] == 1


class TestFriendsRanking:
    def test_includes_me_and_friends_only(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 50)
        maria = _player(db, "maria", 80)
        joao = _player(db, "joao", 20)
        _player(db, "estranho", 999)
        _befriend(db, me, maria)
        _befriend(db, me, joao)

        body = auth_client.get("/api/v1/ranking/friends").json()
        names = [row["user"]["username"] for row in body["entries"]]
        assert names == ["maria", "samuel", "joao"]
        assert [row["position"] for row in body["entries"]] == [1, 2, 3]
        assert body["entries"][1]["is_me"] is True
        assert "estranho" not in names

    def test_solo_circle_is_just_me(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 40)
        _player(db, "naoamigo", 900)

        body = auth_client.get("/api/v1/ranking/friends").json()
        assert len(body["entries"]) == 1
        assert body["entries"][0]["user"]["username"] == "samuel"
        assert body["entries"][0]["is_me"] is True
        assert body["entries"][0]["position"] == 1

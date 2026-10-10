import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Friendship, User, UserStats
from app.models.enums import FriendshipStatus


def _player(
    db: Session, username: str, xp: int = 0, *, correct: int = 0, answered: int = 0
) -> User:
    user = User(
        email=f"{username}@teste.com",
        username=username,
        name=username.title(),
        hashed_password="x",
    )
    user.stats = UserStats(total_xp=xp, correct_answers=correct, questions_answered=answered)
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


def _set_answers(db: Session, user: User, correct: int, answered: int) -> None:
    stats = db.get(UserStats, user.id)
    assert stats is not None
    stats.correct_answers = correct
    stats.questions_answered = answered
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

    def test_deactivated_friends_leave_the_circle(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 50)
        maria = _player(db, "maria", 80)
        joao = _player(db, "joao", 20)
        _befriend(db, me, maria)
        _befriend(db, joao, me)
        maria.is_active = False
        db.flush()

        body = auth_client.get("/api/v1/ranking/friends").json()

        assert [row["user"]["username"] for row in body["entries"]] == ["samuel", "joao"]

    def test_solo_circle_is_just_me(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_xp(db, me, 40)
        _player(db, "naoamigo", 900)

        body = auth_client.get("/api/v1/ranking/friends").json()
        assert len(body["entries"]) == 1
        assert body["entries"][0]["user"]["username"] == "samuel"
        assert body["entries"][0]["is_me"] is True
        assert body["entries"][0]["position"] == 1


class TestAccuracyRanking:
    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/ranking/accuracy").status_code == 401

    def test_orders_by_accuracy_then_answers_then_username(
        self, auth_client: TestClient, db: Session
    ):
        me = _me(auth_client, db)
        _set_answers(db, me, 50, 100)
        _player(db, "zeta", correct=90, answered=100)
        _player(db, "carla", correct=80, answered=100)
        _player(db, "ana", correct=80, answered=100)
        _player(db, "bruno", correct=160, answered=200)
        _player(db, "dora", correct=20, answered=60)
        _player(db, "edu", correct=40, answered=120)

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        names = [row["user"]["username"] for row in body["top"]]
        # 80% ties go to whoever answered more, then by username; same for 1/3.
        assert names == ["zeta", "bruno", "ana", "carla", "samuel", "edu", "dora"]
        assert [row["position"] for row in body["top"]] == [1, 2, 3, 4, 5, 6, 7]
        assert body["top"][1]["accuracy"] == 0.8
        assert body["top"][1]["questions_answered"] == 200
        assert body["top"][1]["correct_answers"] == 160
        assert body["top"][5]["accuracy"] == 40 / 120
        assert body["me"]["position"] == 5
        assert body["me"]["is_me"] is True
        assert body["top"][4]["is_me"] is True
        assert body["my_answers"] == 100
        assert body["min_answers"] == 50
        assert body["total_players"] == 7
        assert "email" not in body["top"][0]["user"]

    def test_needs_fifty_answers_to_qualify(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_answers(db, me, 49, 49)
        _player(db, "novato", correct=3, answered=3)
        _player(db, "veterano", correct=30, answered=50)

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        assert [row["user"]["username"] for row in body["top"]] == ["veterano"]
        assert body["me"] is None
        assert body["my_answers"] == 49
        assert body["total_players"] == 1

    def test_nobody_qualified_yet(self, auth_client: TestClient, db: Session):
        _player(db, "novato", correct=10, answered=10)

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        assert body["top"] == []
        assert body["me"] is None
        assert body["my_answers"] == 0
        assert body["total_players"] == 0

    def test_inactive_users_are_excluded(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_answers(db, me, 60, 100)
        ghost = _player(db, "ghost", correct=100, answered=100)
        ghost.is_active = False
        db.flush()

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        assert [row["user"]["username"] for row in body["top"]] == ["samuel"]
        assert body["total_players"] == 1
        assert body["me"]["position"] == 1

    def test_me_inside_top_ten_is_flagged_in_the_list(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_answers(db, me, 95, 100)
        _player(db, "abaixo", correct=50, answered=100)

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        assert body["top"][0]["is_me"] is True
        assert body["me"]["position"] == 1
        assert body["me"]["accuracy"] == 0.95

    def test_me_outside_top_ten_gets_my_real_position(self, auth_client: TestClient, db: Session):
        me = _me(auth_client, db)
        _set_answers(db, me, 60, 100)
        for index in range(10):
            _player(db, f"top{index:02d}", correct=100 - index, answered=100)
        _player(db, "rival", correct=120, answered=200)  # same 60%, more answers: ahead
        _player(db, "abel", correct=60, answered=100)  # exact tie, username first: ahead
        _player(db, "zora", correct=60, answered=100)  # exact tie, username after: behind
        _player(db, "baixo", correct=10, answered=100)

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        names = [row["user"]["username"] for row in body["top"]]
        assert names == [f"top{i:02d}" for i in range(10)]
        assert not any(row["is_me"] for row in body["top"])
        assert body["me"]["user"]["username"] == "samuel"
        assert body["me"]["position"] == 13
        assert body["me"]["accuracy"] == 0.6
        assert body["total_players"] == 15

    def test_position_survives_large_answer_counts(self, auth_client: TestClient, db: Session):
        # correct * answered passes the 32-bit integer limit at these counts.
        me = _me(auth_client, db)
        _set_answers(db, me, 60_000, 70_000)
        for index in range(10):
            _player(db, f"top{index:02d}", correct=69_000 - index, answered=70_000)
        _player(db, "baixo", correct=50_000, answered=70_000)

        body = auth_client.get("/api/v1/ranking/accuracy").json()

        assert body["me"]["position"] == 11
        assert body["total_players"] == 12

"""All-time podium, season champions' trophies and the champion's celebration."""

import uuid
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Season, SeasonResult, User, UserStats
from app.services import season_service

TODAY = date(2026, 10, 9)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(season_service, "season_today", lambda: TODAY)


def _player(db: Session, username: str, xp: int = 0, *, active: bool = True) -> User:
    user = User(
        email=f"{username}@teste.com",
        username=username,
        name=username.title(),
        hashed_password="x",
        is_active=active,
    )
    user.stats = UserStats(total_xp=xp)
    db.add(user)
    db.flush()
    return user


def _closed_season(db: Session, number: int, month: int) -> Season:
    season = Season(
        number=number,
        starts_on=date(2026, month, 1),
        ends_on=date(2026, month + 1, 1),
        closed_at=datetime(2026, month + 1, 1, 3, tzinfo=UTC),
    )
    db.add(season)
    db.flush()
    return season


def _result(db: Session, season: Season, user: User, xp: int, position: int | None) -> None:
    db.add(
        SeasonResult(
            season_id=season.id,
            user_id=user.id,
            final_xp=xp,
            final_level=5,
            rank_code="semente",
            position=position,
        )
    )
    db.flush()


def _me(client: TestClient, db: Session) -> User:
    user = db.get(User, uuid.UUID(client.get("/api/v1/users/me").json()["id"]))
    assert user is not None
    return user


class TestAllTimePodium:
    def test_best_season_score_per_player_including_the_live_season(
        self, auth_client: TestClient, db: Session
    ):
        august, september = _closed_season(db, 1, 8), _closed_season(db, 2, 9)
        ana, bia = _player(db, "ana"), _player(db, "bia")
        _player(db, "caio", xp=1000)  # scoring live, in the current season
        gone, edu = _player(db, "gone", active=False), _player(db, "edu")
        _result(db, august, ana, 900, 1)
        _result(db, august, bia, 700, 2)
        _result(db, september, bia, 1200, 1)
        _result(db, september, gone, 5000, None)
        _result(db, september, edu, 300, 2)

        body = auth_client.get("/api/v1/ranking/all-time").json()

        podium = body["podium"]
        assert [(e["position"], e["user"]["username"], e["score"]) for e in podium] == [
            (1, "bia", 1200),
            (2, "caio", 1000),
            (3, "ana", 900),
        ]
        assert podium[0]["season"] == {"number": 2, "name": "setembro de 2026"}
        assert podium[0]["live"] is False
        assert podium[1]["season"]["name"] == "outubro de 2026"  # caio's record is live
        assert podium[1]["live"] is True
        assert not any(e["is_me"] for e in podium)

    def test_empty_before_anyone_scores(self, auth_client: TestClient):
        assert auth_client.get("/api/v1/ranking/all-time").json() == {"podium": []}

    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/ranking/all-time").status_code == 401


class TestChampions:
    def test_titles_on_the_dashboard_and_the_public_profile(
        self, auth_client: TestClient, db: Session
    ):
        august, september = _closed_season(db, 1, 8), _closed_season(db, 2, 9)
        me = _me(auth_client, db)
        rival = _player(db, "rival")
        _result(db, august, me, 800, 1)
        _result(db, september, rival, 900, 1)
        _result(db, september, me, 600, 2)

        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["stats"]["champion_titles"] == [{"number": 1, "name": "agosto de 2026"}]

        profile = auth_client.get(f"/api/v1/players/{rival.id}").json()
        assert profile["champion_titles"] == ["setembro de 2026"]

    def test_the_champion_is_celebrated_once_before_the_season_welcome(
        self, auth_client: TestClient, db: Session
    ):
        september = _closed_season(db, 1, 9)
        me = _me(auth_client, db)
        me.tutorial_completed_at = datetime(2026, 8, 1, tzinfo=UTC)
        second, third = _player(db, "segunda"), _player(db, "terceira")
        _result(db, september, me, 1500, 1)
        _result(db, september, second, 1100, 2)
        _result(db, september, third, 900, 3)

        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["champion_celebration"] == {
            "season": {"number": 1, "name": "setembro de 2026"},
            "final_xp": 1500,
        }
        assert dashboard["season_notice"] is None  # the celebration goes first

        assert auth_client.post("/api/v1/users/me/champion-celebration").status_code == 204

        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["champion_celebration"] is None
        # next comes the new season's welcome, revealing how the last one ended
        assert dashboard["season_notice"] == "start"
        podium = dashboard["last_season_podium"]
        assert podium["season"] == {"number": 1, "name": "setembro de 2026"}
        assert [(e["position"], e["username"], e["final_xp"]) for e in podium["entries"]] == [
            (1, me.username, 1500),
            (2, "segunda", 1100),
            (3, "terceira", 900),
        ]

    def test_only_the_champion_is_celebrated(self, auth_client: TestClient, db: Session):
        september = _closed_season(db, 1, 9)
        me = _me(auth_client, db)
        _result(db, september, _player(db, "campea"), 2000, 1)
        _result(db, september, me, 100, 2)
        assert auth_client.get("/api/v1/dashboard").json()["champion_celebration"] is None

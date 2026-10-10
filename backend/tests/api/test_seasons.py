"""Monthly seasons: XP, level and the leaderboards restart; the elos stay."""

import uuid
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Season, SeasonResult, User, UserStats
from app.services import season_service
from app.services.gamification import level_from_total_xp

TODAY = date(2026, 10, 9)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(season_service, "season_today", lambda: TODAY)


def _player(db: Session, username: str, xp: int, *, active: bool = True, best: int = 1) -> User:
    level, _, _ = level_from_total_xp(xp)
    user = User(
        email=f"{username}@teste.com",
        username=username,
        name=username.title(),
        hashed_password="x",
        is_active=active,
    )
    user.stats = UserStats(total_xp=xp, level=level, best_level=max(best, level))
    db.add(user)
    db.flush()
    return user


def _september(db: Session) -> Season:
    season = Season(number=1, starts_on=date(2026, 9, 1), ends_on=date(2026, 10, 1))
    db.add(season)
    db.flush()
    return season


def _me(auth_client: TestClient, db: Session) -> User:
    body = auth_client.get("/api/v1/users/me").json()
    user = db.get(User, uuid.UUID(body["id"]))
    assert user is not None
    return user


class TestCalendar:
    def test_months_and_names(self):
        assert season_service.month_start(date(2026, 10, 9)) == date(2026, 10, 1)
        assert season_service.next_month_start(date(2026, 10, 9)) == date(2026, 11, 1)
        assert season_service.next_month_start(date(2026, 12, 31)) == date(2027, 1, 1)
        season = Season(number=1, starts_on=date(2026, 3, 1), ends_on=date(2026, 4, 1))
        assert season_service.season_name(season) == "março de 2026"

    def test_payload_counts_days_to_the_next_season(self):
        season = Season(number=4, starts_on=date(2026, 10, 1), ends_on=date(2026, 11, 1))
        payload = season_service.season_payload(season, date(2026, 10, 31))
        assert payload == {
            "number": 4,
            "name": "outubro de 2026",
            "starts_on": "2026-10-01",
            "ends_on": "2026-11-01",
            "days_left": 1,
        }


class TestRollover:
    def test_first_season_is_this_month_and_keeps_existing_xp(self, db: Session):
        player = _player(db, "ana", 500)

        season, changed = season_service.ensure_current_season(db, TODAY)

        assert changed is True
        assert (season.number, season.starts_on, season.ends_on) == (
            1,
            date(2026, 10, 1),
            date(2026, 11, 1),
        )
        db.refresh(player)
        assert player.stats.total_xp == 500
        assert db.scalars(select(SeasonResult)).all() == []

    def test_inside_the_season_nothing_happens(self, db: Session):
        season_service.ensure_current_season(db, TODAY)
        season, changed = season_service.ensure_current_season(db, date(2026, 10, 31))
        assert changed is False
        assert season.number == 1

    def test_closing_archives_the_board_and_resets_everyone(self, db: Session):
        september = _september(db)
        zeta = _player(db, "zeta", 2000)  # level 7, broto
        ana = _player(db, "ana", 400)
        bruno = _player(db, "bruno", 400)
        gone = _player(db, "gone", 9000, active=False)
        idle = _player(db, "idle", 0, best=12)
        veteran = _player(db, "veteran", 100, best=20)

        season, changed = season_service.ensure_current_season(db, TODAY)

        assert changed is True
        assert (season.number, season.starts_on) == (2, date(2026, 10, 1))
        assert september.closed_at is not None

        results = {
            r.user_id: r
            for r in db.scalars(select(SeasonResult).where(SeasonResult.season_id == september.id))
        }
        # Same order as the leaderboard: XP, then username; inactive accounts unranked.
        assert results[zeta.id].position == 1
        assert results[ana.id].position == 2
        assert results[bruno.id].position == 3
        assert results[veteran.id].position == 4
        assert results[gone.id].position is None
        assert idle.id not in results  # didn't play the season
        assert results[zeta.id].final_xp == 2000
        assert results[zeta.id].final_level == level_from_total_xp(2000)[0]
        assert results[zeta.id].rank_code == "broto"

        for player in (zeta, ana, bruno, gone, idle, veteran):
            db.refresh(player.stats)
            assert (player.stats.total_xp, player.stats.level) == (0, 1)
        assert zeta.stats.last_season_level == level_from_total_xp(2000)[0]
        assert zeta.stats.best_level == level_from_total_xp(2000)[0]
        assert idle.stats.last_season_level is None
        assert idle.stats.best_level == 12
        assert veteran.stats.best_level == 20  # a weak season never lowers the best

    def test_a_month_without_traffic_is_skipped(self, db: Session):
        _september(db)
        season, _ = season_service.ensure_current_season(db, date(2026, 12, 2))
        assert (season.number, season.starts_on, season.ends_on) == (
            2,
            date(2026, 12, 1),
            date(2027, 1, 1),
        )

    def test_rank_codes_match_the_python_ladder(self, db: Session):
        september = _september(db)
        players = {level: _player(db, f"lvl{level:02d}", 0) for level in (1, 5, 6, 26, 31, 40)}
        for level, player in players.items():
            player.stats.level = level
            player.stats.total_xp = 1  # only who played gets archived
        db.flush()

        season_service.ensure_current_season(db, TODAY)

        codes = {
            r.user_id: r.rank_code
            for r in db.scalars(select(SeasonResult).where(SeasonResult.season_id == september.id))
        }
        for level, player in players.items():
            assert codes[player.id] == season_service.rank_from_level(level).code


class TestRanks:
    def test_best_rank_counts_the_current_season(self):
        stats = UserStats(total_xp=0, level=12, best_level=3, last_season_level=None)
        ranks = season_service.ranks_for(stats)
        assert ranks.best.code == "espiga"
        assert ranks.last_season is None

    def test_last_season_rank(self):
        stats = UserStats(total_xp=0, level=1, best_level=20, last_season_level=8)
        ranks = season_service.ranks_for(stats)
        assert ranks.best.code == "videira"
        assert ranks.last_season is not None and ranks.last_season.code == "broto"


class TestApi:
    def test_global_ranking_names_the_season(self, auth_client: TestClient):
        body = auth_client.get("/api/v1/ranking/global").json()
        assert body["season"] == {
            "number": 1,
            "name": "outubro de 2026",
            "starts_on": "2026-10-01",
            "ends_on": "2026-11-01",
            "days_left": 23,
        }

    def test_first_request_of_the_month_closes_the_last_season(
        self, auth_client: TestClient, db: Session
    ):
        me = _me(auth_client, db)
        # Pretend the season the test opened was September's.
        current = db.scalars(select(Season)).one()
        current.starts_on, current.ends_on = date(2026, 9, 1), date(2026, 10, 1)
        me.stats.total_xp, me.stats.level = 3000, level_from_total_xp(3000)[0]
        db.flush()

        dashboard = auth_client.get("/api/v1/dashboard").json()

        assert dashboard["season"]["number"] == 2
        assert dashboard["stats"]["total_xp"] == 0
        assert dashboard["stats"]["level"] == 1
        assert dashboard["stats"]["rank"]["code"] == "semente"
        expected = season_service.rank_from_level(level_from_total_xp(3000)[0])
        assert dashboard["stats"]["last_season_rank"] == {
            "code": expected.code,
            "name": expected.name,
        }
        assert dashboard["stats"]["best_rank"]["code"] == expected.code
        assert auth_client.get("/api/v1/ranking/global").json()["me"]["total_xp"] == 0

    def test_player_profile_shows_both_elos(self, auth_client: TestClient, db: Session):
        maria = _player(db, "maria", 100, best=27)
        maria.stats.last_season_level = 14
        db.flush()

        body = auth_client.get(f"/api/v1/players/{maria.id}").json()

        assert body["best_rank"] == {"code": "cedro", "name": "Cedro"}
        assert body["last_season_rank"] == {"code": "espiga", "name": "Espiga"}

    def test_new_player_has_no_last_season(self, auth_client: TestClient):
        me = auth_client.get("/api/v1/users/me").json()
        body = auth_client.get(f"/api/v1/players/{me['id']}").json()
        assert body["best_rank"]["code"] == "semente"
        assert body["last_season_rank"] is None


def _skip_tutorial_long_ago(db: Session, user: User) -> None:
    """A player from before seasons: tutorial done, no season notice seen."""
    user.tutorial_completed_at = datetime(2026, 9, 1, tzinfo=UTC)
    db.flush()


def _notice(auth_client: TestClient) -> str | None:
    return auth_client.get("/api/v1/dashboard").json()["season_notice"]


class TestSeasonNotices:
    def test_existing_player_sees_the_start_notice_once(self, auth_client: TestClient, db: Session):
        _skip_tutorial_long_ago(db, _me(auth_client, db))
        assert _notice(auth_client) == "start"

        response = auth_client.post("/api/v1/users/me/season-notice", json={"notice": "start"})

        assert response.status_code == 204
        assert _notice(auth_client) is None

    def test_next_season_brings_it_back(
        self, auth_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ):
        _skip_tutorial_long_ago(db, _me(auth_client, db))
        auth_client.post("/api/v1/users/me/season-notice", json={"notice": "start"})

        monkeypatch.setattr(season_service, "season_today", lambda: date(2026, 11, 2))

        assert _notice(auth_client) == "start"

    def test_nothing_before_the_tutorial_and_the_tutorial_covers_the_start(
        self, auth_client: TestClient
    ):
        assert _notice(auth_client) is None  # new player: the tutorial comes first

        auth_client.post("/api/v1/users/me/tutorial")

        assert _notice(auth_client) is None

    def test_last_week_shows_the_end_notice_instead(
        self, auth_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ):
        me = _me(auth_client, db)
        _skip_tutorial_long_ago(db, me)
        monkeypatch.setattr(season_service, "season_today", lambda: date(2026, 10, 24))
        assert _notice(auth_client) == "start"  # 8 days left: not the last week yet

        monkeypatch.setattr(season_service, "season_today", lambda: date(2026, 10, 25))
        assert _notice(auth_client) == "end"  # 7 days left, start never seen: end wins

        auth_client.post("/api/v1/users/me/season-notice", json={"notice": "end"})

        assert _notice(auth_client) is None
        db.refresh(me)
        assert (me.season_start_seen, me.season_end_seen) == (1, 1)

    def test_new_player_in_the_last_week_still_hears_the_season_is_ending(
        self, auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(season_service, "season_today", lambda: date(2026, 10, 30))
        auth_client.post("/api/v1/users/me/tutorial")
        assert _notice(auth_client) == "end"

    def test_rejects_unknown_notices(self, auth_client: TestClient):
        response = auth_client.post("/api/v1/users/me/season-notice", json={"notice": "middle"})
        assert response.status_code == 422

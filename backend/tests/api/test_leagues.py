"""Ligas: invite-only competitions, points table or knockout cup."""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import League, LeagueMatch, QuestionOption, User, UserStats
from app.models.enums import Difficulty
from app.services import league_service
from tests.factories import make_category, make_mc_question
from tests.helpers import register_and_login

URL = "/api/v1/leagues"


def _player(
    client: TestClient, db: Session, name: str, *, supporter: bool = True
) -> dict[str, str]:
    """Registers a player and returns auth headers; supporters get an active seal."""
    body = register_and_login(client, name=name.title(), email=f"{name}@teste.com")
    if supporter:
        user = db.get(User, body["user"]["id"])
        assert user is not None
        user.supporter_since = datetime.now(UTC)
        user.supporter_until = datetime.now(UTC) + timedelta(days=30)
        db.flush()
    return {"Authorization": f"Bearer {body['access_token']}"}


def _username(client: TestClient, headers: dict[str, str]) -> str:
    return client.get("/api/v1/users/me", headers=headers).json()["username"]


@pytest.fixture
def bank(db: Session) -> list[int]:
    """Eight categories with enough questions for several rounds."""
    ids = []
    for index in range(8):
        category = make_category(db, slug=f"tema{index}")
        for _ in range(4):
            make_mc_question(db, category, difficulty=Difficulty.MEDIUM)
        ids.append(category.id)
    return ids


def _body(bank: list[int], **overrides: Any) -> dict[str, Any]:
    return {
        "name": "Liga da Célula",
        "format": "points",
        "category_ids": bank[:7],
        "difficulties": ["medium"],
        "rounds": 2,
        "ends_on": (league_service.league_today() + timedelta(days=10)).isoformat(),
        **overrides,
    }


def _create(client: TestClient, headers: dict[str, str], bank: list[int], **overrides: Any) -> dict:
    response = client.post(URL, json=_body(bank, **overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _invite_and_join(
    client: TestClient, league_id: str, owner: dict[str, str], guest: dict[str, str]
) -> None:
    invited = client.post(
        f"{URL}/{league_id}/invites", json={"username": _username(client, guest)}, headers=owner
    )
    assert invited.status_code == 200, invited.text
    joined = client.post(f"{URL}/{league_id}/join", headers=guest)
    assert joined.status_code == 200, joined.text


def _play(
    client: TestClient,
    db: Session,
    league_id: str,
    match_id: str,
    headers: dict[str, str],
    *,
    correct: int,
) -> dict:
    """Plays a fixture answering `correct` questions right and the rest wrong."""
    started = client.post(f"{URL}/{league_id}/matches/{match_id}/play", headers=headers)
    assert started.status_code == 200, started.text
    session_id = started.json()["session_id"]
    quiz = client.get(f"/api/v1/quizzes/{session_id}", headers=headers).json()
    assert quiz["mode"] == "league"
    assert quiz["league_id"] == league_id
    for index, question in enumerate(quiz["questions"]):
        option_ids = [o["id"] for o in question["options"]]
        right = str(
            db.scalars(
                select(QuestionOption).where(
                    QuestionOption.id.in_(option_ids), QuestionOption.is_correct
                )
            )
            .one()
            .id
        )
        chosen = right if index < correct else next(o for o in option_ids if o != right)
        answered = client.post(
            f"/api/v1/quizzes/{session_id}/answers",
            json={"question_id": question["id"], "selected_option_id": chosen},
            headers=headers,
        )
        assert answered.status_code == 200, answered.text
    done = client.post(f"/api/v1/quizzes/{session_id}/complete", headers=headers)
    assert done.status_code == 200, done.text
    return done.json()


def _detail(client: TestClient, league_id: str, headers: dict[str, str]) -> dict:
    response = client.get(f"{URL}/{league_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


class TestCreate:
    def test_a_supporter_creates_a_league_and_is_its_first_player(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        league = _create(client, owner, bank)
        assert league["status"] == "recruiting"
        assert league["format"] == "points"
        assert league["rounds"] == 2
        assert league["is_owner"] is True
        assert league["member_count"] == 1
        assert len(league["categories"]) == 7
        assert league["difficulties"] == ["medium"]
        assert [m["status"] for m in league["members"]] == ["active"]

        listed = client.get(URL, headers=owner).json()
        assert listed["can_play"] is True
        assert [item["id"] for item in listed["leagues"]] == [league["id"]]

    def test_only_supporters_create(self, client: TestClient, db: Session, bank: list[int]) -> None:
        visitor = _player(client, db, "visita", supporter=False)
        response = client.post(URL, json=_body(bank), headers=visitor)
        assert response.status_code == 403
        assert "Apoiadores" in response.json()["detail"]
        # They can still open the page.
        assert client.get(URL, headers=visitor).json() == {"can_play": False, "leagues": []}

    @pytest.mark.parametrize(
        ("overrides", "fragment"),
        [
            ({"category_ids": [1, 2, 3]}, "pelo menos 7 temas"),
            ({"rounds": None}, "rodadas"),
            ({"rounds": 0}, "rodadas"),
            ({"rounds": 31}, "rodadas"),
            ({"ends_on": "2020-01-01"}, "amanhã"),
            ({"difficulties": ["expert"]}, "poucas perguntas"),
        ],
    )
    def test_rules_of_a_valid_league(
        self,
        client: TestClient,
        db: Session,
        bank: list[int],
        overrides: dict[str, Any],
        fragment: str,
    ) -> None:
        owner = _player(client, db, "samuel")
        body = _body(bank, **overrides)
        if overrides.get("category_ids") == [1, 2, 3]:
            body["category_ids"] = bank[:3]
        response = client.post(URL, json=body, headers=owner)
        assert response.status_code == 400, response.text
        assert fragment in response.json()["detail"]

    def test_needs_at_least_one_difficulty(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        response = client.post(URL, json=_body(bank, difficulties=[]), headers=owner)
        assert response.status_code == 422

    def test_a_cup_ignores_rounds(self, client: TestClient, db: Session, bank: list[int]) -> None:
        owner = _player(client, db, "samuel")
        league = _create(client, owner, bank, format="cup", rounds=9)
        assert league["format"] == "cup"
        assert league["rounds"] is None


class TestInvites:
    def test_only_the_invited_get_in(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        stranger = _player(client, db, "joao")
        league = _create(client, owner, bank)

        # Private: a stranger can't even see it, let alone join.
        assert client.get(f"{URL}/{league['id']}", headers=stranger).status_code == 404
        assert client.post(f"{URL}/{league['id']}/join", headers=stranger).status_code == 404

        client.post(
            f"{URL}/{league['id']}/invites",
            json={"username": _username(client, guest)},
            headers=owner,
        )
        invited = client.get(URL, headers=guest).json()["leagues"]
        assert [(item["id"], item["my_status"]) for item in invited] == [(league["id"], "invited")]
        assert client.get("/api/v1/dashboard", headers=guest).json()["leagues_pending"] == 1

        joined = client.post(f"{URL}/{league['id']}/join", headers=guest)
        assert joined.status_code == 200
        assert joined.json()["member_count"] == 2
        assert client.get("/api/v1/dashboard", headers=guest).json()["leagues_pending"] == 0

    def test_a_non_supporter_sees_the_invite_but_cannot_join(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria", supporter=False)
        league = _create(client, owner, bank)
        client.post(
            f"{URL}/{league['id']}/invites",
            json={"username": _username(client, guest)},
            headers=owner,
        )
        detail = _detail(client, league["id"], guest)
        assert detail["my_status"] == "invited"
        assert detail["can_play"] is False
        assert client.post(f"{URL}/{league['id']}/join", headers=guest).status_code == 403

    def test_declining_and_being_asked_again(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank)
        invite = {"username": _username(client, guest)}
        client.post(f"{URL}/{league['id']}/invites", json=invite, headers=owner)
        again = client.post(f"{URL}/{league['id']}/invites", json=invite, headers=owner)
        assert again.status_code == 400

        assert client.post(f"{URL}/{league['id']}/decline", headers=guest).status_code == 204
        assert client.get(URL, headers=guest).json()["leagues"] == []
        reinvited = client.post(f"{URL}/{league['id']}/invites", json=invite, headers=owner)
        assert reinvited.status_code == 200
        assert reinvited.json()["invited_count"] == 1

    def test_only_the_owner_invites_and_removes(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        other = _player(client, db, "joao")
        league = _create(client, owner, bank)
        _invite_and_join(client, league["id"], owner, guest)

        not_owner = client.post(
            f"{URL}/{league['id']}/invites",
            json={"username": _username(client, other)},
            headers=guest,
        )
        assert not_owner.status_code == 403
        guest_id = client.get("/api/v1/users/me", headers=guest).json()["id"]
        removed = client.delete(f"{URL}/{league['id']}/members/{guest_id}", headers=owner)
        assert removed.status_code == 200
        assert removed.json()["member_count"] == 1
        assert client.get(f"{URL}/{league['id']}", headers=guest).status_code == 404

    def test_twenty_players_at_most_invites_included(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        league = _create(client, owner, bank)
        for index in range(19):
            guest = _player(client, db, f"convidado{index}")
            invited = client.post(
                f"{URL}/{league['id']}/invites",
                json={"username": _username(client, guest)},
                headers=owner,
            )
            assert invited.status_code == 200, invited.text
        extra = _player(client, db, "sobrando")
        full = client.post(
            f"{URL}/{league['id']}/invites",
            json={"username": _username(client, extra)},
            headers=owner,
        )
        assert full.status_code == 400
        assert "20 jogadores" in full.json()["detail"]

    def test_leaving_and_deleting_before_the_start(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank)
        _invite_and_join(client, league["id"], owner, guest)

        assert client.post(f"{URL}/{league['id']}/leave", headers=owner).status_code == 400
        assert client.post(f"{URL}/{league['id']}/leave", headers=guest).status_code == 204
        assert client.delete(f"{URL}/{league['id']}", headers=guest).status_code == 404
        assert client.delete(f"{URL}/{league['id']}", headers=owner).status_code == 204
        assert client.get(URL, headers=owner).json()["leagues"] == []


class TestPointsLeague:
    def _started(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> tuple[dict, dict[str, str], dict[str, str]]:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank)
        _invite_and_join(client, league["id"], owner, guest)
        started = client.post(f"{URL}/{league['id']}/start", headers=owner)
        assert started.status_code == 200, started.text
        return started.json(), owner, guest

    def test_needs_two_players(self, client: TestClient, db: Session, bank: list[int]) -> None:
        owner = _player(client, db, "samuel")
        league = _create(client, owner, bank)
        response = client.post(f"{URL}/{league['id']}/start", headers=owner)
        assert response.status_code == 400
        assert "pelo menos 2 jogadores" in response.json()["detail"]

    def test_starting_draws_the_rounds_and_closes_the_door(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        late = _player(client, db, "joao")
        league = _create(client, owner, bank)
        _invite_and_join(client, league["id"], owner, guest)
        client.post(
            f"{URL}/{league['id']}/invites",
            json={"username": _username(client, late)},
            headers=owner,
        )
        started = client.post(f"{URL}/{league['id']}/start", headers=owner).json()
        assert started["status"] == "active"
        assert [r["round"] for r in started["rounds_played"]] == [1, 2]
        assert started["bracket"] == []
        # The invite nobody answered lapsed with the start.
        assert started["invited_count"] == 0
        assert client.get(f"{URL}/{league['id']}", headers=late).status_code == 404
        assert client.post(f"{URL}/{league['id']}/start", headers=owner).status_code == 400

    def test_rounds_in_order_once_each_same_questions_for_all(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, owner, guest = self._started(client, db, bank)
        first, second = (r["match_id"] for r in league["rounds_played"])
        assert league["my_match_id"] == first

        skipped = client.post(f"{URL}/{league['id']}/matches/{second}/play", headers=owner)
        assert skipped.status_code == 400
        assert "em ordem" in skipped.json()["detail"]

        owner_session = client.post(
            f"{URL}/{league['id']}/matches/{first}/play", headers=owner
        ).json()["session_id"]
        # Opening it again resumes the same session.
        again = client.post(f"{URL}/{league['id']}/matches/{first}/play", headers=owner).json()
        assert again["session_id"] == owner_session
        guest_session = client.post(
            f"{URL}/{league['id']}/matches/{first}/play", headers=guest
        ).json()["session_id"]

        def questions(session_id: str, headers: dict[str, str]) -> list[str]:
            quiz = client.get(f"/api/v1/quizzes/{session_id}", headers=headers).json()
            assert quiz["timer_seconds"] == 20
            return [q["id"] for q in quiz["questions"]]

        assert questions(owner_session, owner) == questions(guest_session, guest)
        assert len(questions(owner_session, owner)) == 10

        _play(client, db, league["id"], first, owner, correct=7)
        replay = client.post(f"{URL}/{league['id']}/matches/{first}/play", headers=owner)
        assert replay.status_code == 400
        assert _detail(client, league["id"], owner)["my_match_id"] == second

    def test_points_by_difficulty_and_the_table(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, owner, guest = self._started(client, db, bank)
        first, second = (r["match_id"] for r in league["rounds_played"])
        _play(client, db, league["id"], first, owner, correct=6)
        _play(client, db, league["id"], first, guest, correct=9)

        detail = _detail(client, league["id"], owner)
        table = [
            (row["user"]["username"], row["points"], row["played"]) for row in detail["standings"]
        ]
        # Medium questions are worth 20 league points each.
        assert table == [("maria", 180, 1), ("samuel", 120, 1)]
        assert detail["standings"][1]["is_me"] is True
        round_one = detail["rounds_played"][0]
        assert round_one["played_count"] == 2
        assert round_one["my_score"]["points"] == 120
        assert round_one["my_score"]["correct"] == 6
        assert detail["status"] == "active"

        _play(client, db, league["id"], second, owner, correct=10)
        _play(client, db, league["id"], second, guest, correct=2)
        done = _detail(client, league["id"], guest)
        # Everyone played everything: the league ends before its date.
        assert done["status"] == "finished"
        assert done["champion"]["username"] == "samuel"
        assert [row["points"] for row in done["standings"]] == [320, 220]
        assert done["my_match_id"] is None

    def test_league_rounds_pay_no_season_xp(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, owner, _guest = self._started(client, db, bank)
        first = league["rounds_played"][0]["match_id"]
        summary = _play(client, db, league["id"], first, owner, correct=10)
        assert summary["xp_earned"] == 0
        assert summary["bonus_xp"] == 0
        me = client.get("/api/v1/users/me", headers=owner).json()
        stats = db.get(UserStats, me["id"])
        assert stats is not None
        db.refresh(stats)
        # The only XP is from the one-off achievements a first perfect quiz
        # unlocks, exactly as a duel round would; the round itself pays none.
        badges = sum(a["xp_reward"] for a in summary["unlocked_achievements"])
        assert stats.total_xp == badges
        # But it is real study: answers and wisdom count.
        assert stats.questions_answered == 10
        assert stats.wisdom_points == 10

    def test_a_lapsed_supporter_cannot_play(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, _owner, guest = self._started(client, db, bank)
        me = client.get("/api/v1/users/me", headers=guest).json()
        user = db.get(User, me["id"])
        assert user is not None
        user.supporter_until = datetime.now(UTC) - timedelta(days=1)
        db.flush()

        first = league["rounds_played"][0]["match_id"]
        blocked = client.post(f"{URL}/{league['id']}/matches/{first}/play", headers=guest)
        assert blocked.status_code == 403
        # They still see the league and its table.
        detail = _detail(client, league["id"], guest)
        assert detail["can_play"] is False
        assert len(detail["standings"]) == 2

    def test_abandoning_a_round_counts_what_was_answered(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, owner, _guest = self._started(client, db, bank)
        first = league["rounds_played"][0]["match_id"]
        session_id = client.post(
            f"{URL}/{league['id']}/matches/{first}/play", headers=owner
        ).json()["session_id"]
        quiz = client.get(f"/api/v1/quizzes/{session_id}", headers=owner).json()
        question = quiz["questions"][0]
        right = str(
            db.scalars(
                select(QuestionOption).where(
                    QuestionOption.id.in_([o["id"] for o in question["options"]]),
                    QuestionOption.is_correct,
                )
            )
            .one()
            .id
        )
        client.post(
            f"/api/v1/quizzes/{session_id}/answers",
            json={"question_id": question["id"], "selected_option_id": right},
            headers=owner,
        )
        assert (
            client.post(f"/api/v1/quizzes/{session_id}/abandon", headers=owner).status_code == 200
        )

        round_one = _detail(client, league["id"], owner)["rounds_played"][0]
        assert round_one["my_score"] == {"points": 20, "correct": 1, "time_seconds": 200}

    def test_the_end_date_crowns_whoever_leads(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, owner, guest = self._started(client, db, bank)
        first = league["rounds_played"][0]["match_id"]
        _play(client, db, league["id"], first, guest, correct=5)

        row = db.get(League, uuid.UUID(league["id"]))
        assert row is not None
        row.ends_at = datetime.now(UTC) - timedelta(minutes=1)
        db.flush()

        closed = _detail(client, league["id"], owner)
        assert closed["status"] == "finished"
        assert closed["champion"]["username"] == "maria"
        late = client.post(f"{URL}/{league['id']}/matches/{first}/play", headers=owner)
        assert late.status_code == 400

    def test_nobody_played_by_the_end_date_is_incomplete(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, owner, _guest = self._started(client, db, bank)
        row = db.get(League, uuid.UUID(league["id"]))
        assert row is not None
        row.ends_at = datetime.now(UTC) - timedelta(minutes=1)
        db.flush()
        closed = _detail(client, league["id"], owner)
        assert closed["status"] == "incomplete"
        assert closed["champion"] is None


class TestCup:
    def _cup(
        self, client: TestClient, db: Session, bank: list[int], names: list[str]
    ) -> tuple[dict, dict[str, dict[str, str]]]:
        players = {name: _player(client, db, name) for name in names}
        owner = players[names[0]]
        league = _create(client, owner, bank, format="cup", rounds=None)
        for name in names[1:]:
            _invite_and_join(client, league["id"], owner, players[name])
        return league, players

    @pytest.mark.parametrize(
        ("names", "hint"),
        [
            (["ana", "bia", "caio"], "Com 3, convide mais 1 ou remova 1."),
            (["ana", "bia", "caio", "davi", "eva", "fabio"], "Com 6, convide mais 2 ou remova 2."),
        ],
    )
    def test_only_full_brackets_can_start(
        self, client: TestClient, db: Session, bank: list[int], names: list[str], hint: str
    ) -> None:
        league, players = self._cup(client, db, bank, names)
        response = client.post(f"{URL}/{league['id']}/start", headers=players["ana"])
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "2, 4, 8 ou 16 jogadores" in detail
        assert detail.endswith(hint)
        assert _detail(client, league["id"], players["ana"])["status"] == "recruiting"

    def test_the_bracket_is_drawn_at_the_start(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        names = ["ana", "bia", "caio", "davi"]
        league, players = self._cup(client, db, bank, names)
        started = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()
        assert started["status"] == "active"
        assert started["rounds_played"] == []
        bracket = started["bracket"]
        assert [r["label"] for r in bracket] == ["Semifinal", "Final"]
        assert [m["third_place"] for m in bracket[1]["matches"]] == [False, True]
        seated = sorted(
            side["user"]["username"] for m in bracket[0]["matches"] for side in (m["a"], m["b"])
        )
        assert seated == sorted(names)
        final = bracket[1]["matches"][0]
        assert final["a"]["user"] is None and final["b"]["user"] is None
        assert {final["a"]["from_match"], final["b"]["from_match"]} == {1, 2}
        # Each player has exactly their semifinal to play.
        for name in names:
            mine = _detail(client, league["id"], players[name])["my_match_id"]
            match = next(m for m in bracket[0]["matches"] if m["id"] == mine)
            assert name in (match["a"]["user"]["username"], match["b"]["user"]["username"])

    def test_playing_it_out_to_a_champion(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        names = ["ana", "bia", "caio", "davi"]
        league, players = self._cup(client, db, bank, names)
        bracket = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()[
            "bracket"
        ]
        winners = []
        for match in bracket[0]["matches"]:
            strong = match["a"]["user"]["username"]
            weak = match["b"]["user"]["username"]
            _play(client, db, league["id"], match["id"], players[strong], correct=8)
            # Until both have played, nobody sees a score to chase.
            midway = _detail(client, league["id"], players[weak])
            half = next(
                m for r in midway["bracket"] for m in r["matches"] if m["id"] == match["id"]
            )
            assert half["winner_id"] is None
            assert half["a"]["played"] is True and half["a"]["score"] is None
            _play(client, db, league["id"], match["id"], players[weak], correct=3)
            winners.append(strong)

        detail = _detail(client, league["id"], players[winners[0]])
        semis = detail["bracket"][0]["matches"]
        assert all(m["decided_by"] == "points" for m in semis)
        assert semis[0]["a"]["score"]["points"] == 160
        final = detail["bracket"][1]["matches"][0]
        assert sorted([final["a"]["user"]["username"], final["b"]["user"]["username"]]) == sorted(
            winners
        )
        assert detail["my_match_id"] == final["id"]
        loser = next(name for name in names if name not in winners)

        # The beaten semifinalists are out of the title, but meet for third place.
        third = detail["bracket"][1]["matches"][1]
        losers = [name for name in names if name not in winners]
        assert third["third_place"] is True
        assert sorted([third["a"]["user"]["username"], third["b"]["user"]["username"]]) == sorted(
            losers
        )
        assert _detail(client, league["id"], players[losers[0]])["my_match_id"] == third["id"]

        _play(client, db, league["id"], final["id"], players[winners[0]], correct=4)
        _play(client, db, league["id"], final["id"], players[winners[1]], correct=9)
        # The title is decided, but the cup isn't over until third place is played.
        waiting = _detail(client, league["id"], players[loser])
        assert waiting["status"] == "active"
        assert waiting["champion"] is None

        _play(client, db, league["id"], third["id"], players[losers[0]], correct=7)
        _play(client, db, league["id"], third["id"], players[losers[1]], correct=2)
        done = _detail(client, league["id"], players[loser])
        assert done["status"] == "finished"
        assert done["champion"]["username"] == winners[1]
        table = done["standings"]
        assert [row["user"]["username"] for row in table] == [
            winners[1],
            winners[0],
            losers[0],
            losers[1],
        ]
        assert [row["podium"] for row in table] == [1, 2, 3, None]
        assert table[0]["wins"] == 2 and table[0]["eliminated"] is False
        assert table[1]["eliminated"] is True
        # Third place is its own contest: it adds no win in the title race.
        assert table[2]["wins"] == 0

    def test_someone_elses_match_is_not_mine_to_play(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, players = self._cup(client, db, bank, ["ana", "bia", "caio", "davi"])
        bracket = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()[
            "bracket"
        ]
        match = bracket[0]["matches"][0]
        inside = {match["a"]["user"]["username"], match["b"]["user"]["username"]}
        outsider = next(name for name in players if name not in inside)
        response = client.post(
            f"{URL}/{league['id']}/matches/{match['id']}/play", headers=players[outsider]
        )
        assert response.status_code == 403
        final = bracket[1]["matches"][0]
        early = client.post(
            f"{URL}/{league['id']}/matches/{final['id']}/play", headers=players[outsider]
        )
        assert early.status_code == 403

    def test_same_points_the_faster_round_wins(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, players = self._cup(client, db, bank, ["ana", "bia"])
        bracket = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()[
            "bracket"
        ]
        assert [r["label"] for r in bracket] == ["Final"]
        match = bracket[0]["matches"][0]
        _play(client, db, league["id"], match["id"], players["ana"], correct=5)
        # Make ana's round the slower one before bia's settles the match.
        row = db.get(LeagueMatch, uuid.UUID(match["id"]))
        assert row is not None
        db.refresh(row)
        ana_entry = row.entries[0]
        ana_entry.time_seconds = 150
        db.flush()
        _play(client, db, league["id"], match["id"], players["bia"], correct=5)

        done = _detail(client, league["id"], players["ana"])
        final = done["bracket"][0]["matches"][0]
        assert final["decided_by"] == "time"
        assert done["champion"]["username"] == "bia"

    def test_eight_players_quarters_semis_final_and_third_place(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        names = ["ana", "bia", "caio", "davi", "eva", "fabio", "gabi", "hugo"]
        league, players = self._cup(client, db, bank, names)
        bracket = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()[
            "bracket"
        ]
        assert [r["label"] for r in bracket] == ["Quartas de final", "Semifinal", "Final"]
        assert [len(r["matches"]) for r in bracket] == [4, 2, 2]
        final, third = bracket[2]["matches"]
        assert final["third_place"] is False and third["third_place"] is True
        # The third-place seats wait for the losers of the two semifinals.
        semis = {m["number"] for m in bracket[1]["matches"]}
        assert {third["a"]["from_match"], third["b"]["from_match"]} == semis
        assert third["a"]["from_loser"] is True and final["a"]["from_loser"] is False

    def test_the_end_date_leaves_an_unfinished_cup_incomplete(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, players = self._cup(client, db, bank, ["ana", "bia", "caio", "davi"])
        bracket = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()[
            "bracket"
        ]
        match = bracket[0]["matches"][0]
        _play(
            client,
            db,
            league["id"],
            match["id"],
            players[match["a"]["user"]["username"]],
            correct=5,
        )

        row = db.get(League, uuid.UUID(league["id"]))
        assert row is not None
        row.ends_at = datetime.now(UTC) - timedelta(minutes=1)
        db.flush()
        closed = _detail(client, league["id"], players["ana"])
        assert closed["status"] == "incomplete"
        assert closed["champion"] is None
        # History: it still shows up in everyone's list.
        listed = client.get(URL, headers=players["davi"]).json()["leagues"]
        assert [(item["id"], item["status"]) for item in listed] == [(league["id"], "incomplete")]


def test_a_league_never_started_by_its_date_is_incomplete(
    client: TestClient, db: Session, bank: list[int]
) -> None:
    owner = _player(client, db, "samuel")
    league = _create(client, owner, bank)
    row = db.get(League, uuid.UUID(league["id"]))
    assert row is not None
    row.ends_at = datetime.now(UTC) - timedelta(minutes=1)
    db.flush()
    assert _detail(client, league["id"], owner)["status"] == "incomplete"
    assert client.post(f"{URL}/{league['id']}/start", headers=owner).status_code == 400


def test_the_last_day_runs_to_midnight_in_brasilia() -> None:
    ends_at = league_service.ends_at_for(date(2026, 11, 20))
    assert ends_at == datetime(2026, 11, 21, 3, 0, tzinfo=UTC)


def _unlocked(client: TestClient, headers: dict[str, str]) -> set[str]:
    achievements = client.get("/api/v1/achievements", headers=headers).json()
    return {a["code"] for a in achievements if a["unlocked_at"]}


def _expire_deadline(db: Session, match_id: str) -> None:
    row = db.get(LeagueMatch, uuid.UUID(match_id))
    assert row is not None
    row.deadline_at = datetime.now(UTC) - timedelta(minutes=1)
    db.flush()


class TestCupDeadline:
    """24 hours per cup match: whoever doesn't play loses, and the bracket moves on."""

    def _started(
        self, client: TestClient, db: Session, bank: list[int], names: list[str]
    ) -> tuple[str, dict[str, dict[str, str]], list[dict]]:
        players = {name: _player(client, db, name) for name in names}
        owner = players[names[0]]
        league = _create(client, owner, bank, format="cup", rounds=None)
        for name in names[1:]:
            _invite_and_join(client, league["id"], owner, players[name])
        started = client.post(f"{URL}/{league['id']}/start", headers=owner).json()
        return league["id"], players, started["bracket"]

    def test_round_one_gets_24_hours_from_the_start(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league_id, players, bracket = self._started(
            client, db, bank, ["ana", "bia", "caio", "davi"]
        )
        for match in bracket[0]["matches"]:
            deadline = datetime.fromisoformat(match["deadline_at"])
            left = deadline - datetime.now(UTC)
            assert timedelta(hours=23, minutes=59) < left <= timedelta(hours=24)
        # The final has no clock until both finalists are known.
        assert bracket[1]["matches"][0]["deadline_at"] is None
        mine = _detail(client, league_id, players["ana"])
        assert mine["my_match_deadline_at"] is not None

    def test_whoever_did_not_play_loses_by_walkover(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league_id, players, bracket = self._started(
            client, db, bank, ["ana", "bia", "caio", "davi"]
        )
        match = bracket[0]["matches"][0]
        showed = match["a"]["user"]["username"]
        absent = match["b"]["user"]["username"]
        _play(client, db, league_id, match["id"], players[showed], correct=1)
        _expire_deadline(db, match["id"])

        detail = _detail(client, league_id, players[absent])
        settled = detail["bracket"][0]["matches"][0]
        assert settled["decided_by"] == "walkover"
        assert settled["winner_id"] == match["a"]["user"]["id"]
        # Out of the title race: the seat in the final is taken, and what is
        # left for them is the third-place match, once the other semifinal ends.
        assert detail["my_match_id"] is None
        late = client.post(f"{URL}/{league_id}/matches/{match['id']}/play", headers=players[absent])
        assert late.status_code == 400
        final = detail["bracket"][1]["matches"][0]
        seated = {side["user"]["username"] for side in (final["a"], final["b"]) if side["user"]}
        assert seated == {showed}
        row = next(r for r in detail["standings"] if r["user"]["username"] == absent)
        assert row["eliminated"] is True

    def test_nobody_played_no_winner_and_the_other_finalist_walks_over(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league_id, players, bracket = self._started(
            client, db, bank, ["ana", "bia", "caio", "davi"]
        )
        ghost, played = bracket[0]["matches"]
        _expire_deadline(db, ghost["id"])
        midway = _detail(client, league_id, players["ana"])
        void = midway["bracket"][0]["matches"][0]
        assert void["decided_by"] == "void" and void["winner_id"] is None
        final = midway["bracket"][1]["matches"][0]
        empty = next(side for side in (final["a"], final["b"]) if side["vacant"])
        assert empty["user"] is None
        assert midway["status"] == "active"

        strong = played["a"]["user"]["username"]
        weak = played["b"]["user"]["username"]
        _play(client, db, league_id, played["id"], players[strong], correct=6)
        _play(client, db, league_id, played["id"], players[weak], correct=2)

        done = _detail(client, league_id, players[strong])
        # Nobody was waiting in the final: the semifinal's winner takes the cup.
        assert done["status"] == "finished"
        assert done["champion"]["username"] == strong
        assert done["bracket"][1]["matches"][0]["decided_by"] == "walkover"
        # Third place had one semifinal loser and an empty seat: his by walkover.
        third = done["bracket"][1]["matches"][1]
        assert third["third_place"] is True and third["decided_by"] == "walkover"
        podium = {row["user"]["username"]: row["podium"] for row in done["standings"]}
        assert podium[strong] == 1 and podium[weak] == 3
        # Nobody reached the final from the other side, so there is no runner-up.
        assert 2 not in podium.values()

    def test_a_cup_nobody_played_ends_without_a_champion(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league_id, players, bracket = self._started(
            client, db, bank, ["ana", "bia", "caio", "davi"]
        )
        for match in bracket[0]["matches"]:
            _expire_deadline(db, match["id"])
        done = _detail(client, league_id, players["ana"])
        assert done["status"] == "incomplete"
        assert done["champion"] is None
        assert [m["decided_by"] for r in done["bracket"] for m in r["matches"]] == ["void"] * 4

    def test_the_next_match_starts_its_own_24_hours(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league_id, players, bracket = self._started(
            client, db, bank, ["ana", "bia", "caio", "davi"]
        )
        for match in bracket[0]["matches"]:
            _play(
                client,
                db,
                league_id,
                match["id"],
                players[match["a"]["user"]["username"]],
                correct=5,
            )
            _play(
                client,
                db,
                league_id,
                match["id"],
                players[match["b"]["user"]["username"]],
                correct=1,
            )
        final = _detail(client, league_id, players["ana"])["bracket"][1]["matches"][0]
        left = datetime.fromisoformat(final["deadline_at"]) - datetime.now(UTC)
        assert timedelta(hours=23, minutes=59) < left <= timedelta(hours=24)

    def test_a_round_in_progress_when_the_clock_runs_out_may_finish(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league_id, players, bracket = self._started(client, db, bank, ["ana", "bia"])
        match = bracket[0]["matches"][0]
        first = match["a"]["user"]["username"]
        second = match["b"]["user"]["username"]
        _play(client, db, league_id, match["id"], players[first], correct=2)
        # The other player is mid-round as the deadline passes.
        opened = client.post(
            f"{URL}/{league_id}/matches/{match['id']}/play", headers=players[second]
        )
        assert opened.status_code == 200
        _expire_deadline(db, match["id"])
        still = _detail(client, league_id, players[first])
        assert still["bracket"][0]["matches"][0]["winner_id"] is None
        assert still["status"] == "active"


class TestInviteLink:
    def test_the_admin_gets_a_link_while_recruiting(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank)
        assert league["invite_code"]
        _invite_and_join(client, league["id"], owner, guest)
        # Only the admin sees it, and it goes away once the league starts.
        assert _detail(client, league["id"], guest)["invite_code"] is None
        started = client.post(f"{URL}/{league['id']}/start", headers=owner).json()
        assert started["invite_code"] is None

    def test_anyone_can_preview_the_link_before_signing_in(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        league = _create(client, owner, bank, name="Liga da Célula")
        preview = client.get(f"{URL}/invite/{league['invite_code']}")
        assert preview.status_code == 200, preview.text
        body = preview.json()
        assert body["name"] == "Liga da Célula"
        assert body["admin_username"] == "samuel"
        assert body["member_count"] == 1
        assert body["open"] is True
        # Nothing about the players beyond the admin's name.
        assert "members" not in body and "id" not in body
        assert client.get(f"{URL}/invite/nao-existe").status_code == 404

    def test_opening_the_link_is_being_invited(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank)
        code = league["invite_code"]
        assert client.post(f"{URL}/invite/{code}/redeem").status_code == 401

        redeemed = client.post(f"{URL}/invite/{code}/redeem", headers=guest)
        assert redeemed.status_code == 200, redeemed.text
        assert redeemed.json() == {"league_id": league["id"]}
        detail = _detail(client, league["id"], guest)
        assert detail["my_status"] == "invited"
        # Opening it again changes nothing, before or after accepting.
        client.post(f"{URL}/invite/{code}/redeem", headers=guest)
        assert _detail(client, league["id"], owner)["invited_count"] == 1
        assert client.post(f"{URL}/{league['id']}/join", headers=guest).status_code == 200
        again = client.post(f"{URL}/invite/{code}/redeem", headers=guest)
        assert again.status_code == 200
        assert _detail(client, league["id"], guest)["my_status"] == "active"

    def test_a_non_supporter_lands_on_the_invite_but_cannot_accept(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria", supporter=False)
        league = _create(client, owner, bank)
        redeemed = client.post(f"{URL}/invite/{league['invite_code']}/redeem", headers=guest)
        assert redeemed.status_code == 200
        assert _detail(client, league["id"], guest)["my_status"] == "invited"
        assert client.post(f"{URL}/{league['id']}/join", headers=guest).status_code == 403

    def test_the_link_stops_working_once_the_league_starts(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        late = _player(client, db, "joao")
        league = _create(client, owner, bank)
        _invite_and_join(client, league["id"], owner, guest)
        client.post(f"{URL}/{league['id']}/start", headers=owner)

        assert client.get(f"{URL}/invite/{league['invite_code']}").json()["open"] is False
        refused = client.post(f"{URL}/invite/{league['invite_code']}/redeem", headers=late)
        assert refused.status_code == 400
        assert "já começou" in refused.json()["detail"]


class TestRules:
    def test_the_admin_chooses_questions_and_time(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank, question_count=5, timer_seconds=30)
        assert league["question_count"] == 5 and league["timer_seconds"] == 30
        _invite_and_join(client, league["id"], owner, guest)
        started = client.post(f"{URL}/{league['id']}/start", headers=owner).json()
        first = started["rounds_played"][0]["match_id"]

        session_id = client.post(
            f"{URL}/{league['id']}/matches/{first}/play", headers=owner
        ).json()["session_id"]
        quiz = client.get(f"/api/v1/quizzes/{session_id}", headers=owner).json()
        assert len(quiz["questions"]) == 5
        assert quiz["timer_seconds"] == 30
        # Leaving is charged the league's own full clock: 5 questions of 30 s.
        client.post(f"/api/v1/quizzes/{session_id}/abandon", headers=owner)
        score = _detail(client, league["id"], owner)["rounds_played"][0]["my_score"]
        assert score["time_seconds"] == 150

    @pytest.mark.parametrize(
        ("overrides", "fragment"),
        [
            ({"question_count": 4}, "de 5 a 20 perguntas"),
            ({"question_count": 21}, "de 5 a 20 perguntas"),
            ({"timer_seconds": 25}, "tempos por pergunta"),
            ({"timer_seconds": 5}, "tempos por pergunta"),
        ],
    )
    def test_within_the_allowed_range(
        self,
        client: TestClient,
        db: Session,
        bank: list[int],
        overrides: dict[str, Any],
        fragment: str,
    ) -> None:
        owner = _player(client, db, "samuel")
        response = client.post(URL, json=_body(bank, **overrides), headers=owner)
        assert response.status_code == 400
        assert fragment in response.json()["detail"]

    def test_the_pool_must_cover_one_fixture(self, client: TestClient, db: Session) -> None:
        owner = _player(client, db, "samuel")
        thin = []
        for index in range(7):
            category = make_category(db, slug=f"raso{index}")
            make_mc_question(db, category, difficulty=Difficulty.HARD)
            thin.append(category.id)
        body = _body(thin, difficulties=["hard"])
        # Seven questions in all: enough for fixtures of 5, not of 10.
        short = client.post(URL, json={**body, "question_count": 10}, headers=owner)
        assert short.status_code == 400
        assert "poucas perguntas" in short.json()["detail"]
        assert (
            client.post(URL, json={**body, "question_count": 5}, headers=owner).status_code == 201
        )


class TestLeagueAchievements:
    def test_first_match_and_a_perfect_one(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank, rounds=2)
        _invite_and_join(client, league["id"], owner, guest)
        started = client.post(f"{URL}/{league['id']}/start", headers=owner).json()
        first, second = (r["match_id"] for r in started["rounds_played"])
        assert not {"league_round_1", "league_perfect_1"} & _unlocked(client, owner)

        _play(client, db, league["id"], first, owner, correct=6)
        assert "league_round_1" in _unlocked(client, owner)
        assert "league_perfect_1" not in _unlocked(client, owner)
        _play(client, db, league["id"], second, owner, correct=10)
        assert "league_perfect_1" in _unlocked(client, owner)
        # League badges never pay XP.
        me = client.get("/api/v1/users/me", headers=owner).json()
        stats = db.get(UserStats, me["id"])
        assert stats is not None
        league_badges = [
            a
            for a in client.get("/api/v1/achievements", headers=owner).json()
            if a["code"].startswith("league")
        ]
        assert len(league_badges) == 6
        assert all(a["xp_reward"] == 0 for a in league_badges)

    def test_the_champion_of_a_points_league(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank, rounds=1)
        _invite_and_join(client, league["id"], owner, guest)
        started = client.post(f"{URL}/{league['id']}/start", headers=owner).json()
        only = started["rounds_played"][0]["match_id"]
        _play(client, db, league["id"], only, owner, correct=3)
        # The guest's round ends the league: the champion gets the title
        # although the request that settled it was someone else's.
        _play(client, db, league["id"], only, guest, correct=1)

        assert "league_win_1" in _unlocked(client, owner)
        assert "league_cup_win_1" not in _unlocked(client, owner)
        assert "league_win_1" not in _unlocked(client, guest)

    def test_the_champion_of_a_cup_even_by_walkover(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        owner = _player(client, db, "samuel")
        guest = _player(client, db, "maria")
        league = _create(client, owner, bank, format="cup", rounds=None)
        _invite_and_join(client, league["id"], owner, guest)
        bracket = client.post(f"{URL}/{league['id']}/start", headers=owner).json()["bracket"]
        match = bracket[0]["matches"][0]
        _play(client, db, league["id"], match["id"], owner, correct=4)
        _expire_deadline(db, match["id"])
        # Looking at the league is what applies the deadline, and the titles.
        assert _detail(client, league["id"], guest)["champion"]["username"] == "samuel"
        assert {"league_win_1", "league_cup_win_1"} <= _unlocked(client, owner)

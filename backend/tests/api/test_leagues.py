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

    def test_an_odd_number_cannot_start(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        league, players = self._cup(client, db, bank, ["ana", "bia", "caio"])
        response = client.post(f"{URL}/{league['id']}/start", headers=players["ana"])
        assert response.status_code == 400
        assert "número par" in response.json()["detail"]

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
        # The beaten are out: nothing left for them to play.
        loser = next(name for name in names if name not in winners)
        assert _detail(client, league["id"], players[loser])["my_match_id"] is None

        _play(client, db, league["id"], final["id"], players[winners[0]], correct=4)
        _play(client, db, league["id"], final["id"], players[winners[1]], correct=9)
        done = _detail(client, league["id"], players[loser])
        assert done["status"] == "finished"
        assert done["champion"]["username"] == winners[1]
        table = done["standings"]
        assert table[0]["user"]["username"] == winners[1]
        assert table[0]["wins"] == 2 and table[0]["eliminated"] is False
        assert table[1]["user"]["username"] == winners[0]
        assert table[1]["eliminated"] is True
        assert {row["user"]["username"] for row in table[2:]} == set(names) - set(winners)

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

    def test_six_players_one_rests_and_the_bracket_says_so(
        self, client: TestClient, db: Session, bank: list[int]
    ) -> None:
        names = ["ana", "bia", "caio", "davi", "eva", "fabio"]
        league, players = self._cup(client, db, bank, names)
        bracket = client.post(f"{URL}/{league['id']}/start", headers=players["ana"]).json()[
            "bracket"
        ]
        assert [len(r["matches"]) for r in bracket] == [3, 1, 1]
        assert [r["label"] for r in bracket] == ["Rodada 1", "Rodada 2", "Final"]
        assert bracket[0]["byes"] == []
        # The winner of match 3 rests in round 2.
        assert [bye["from_match"] for bye in bracket[1]["byes"]] == [3]

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

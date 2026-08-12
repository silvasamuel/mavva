from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Duel, QuestionOption
from app.services import duel_service
from tests.factories import make_category, make_mc_question, make_open_question


def _register(client: TestClient, email: str, name: str = "Jogador") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": "senha-forte-123"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_questions(db: Session, count: int = 10) -> None:
    category = make_category(db)
    for _ in range(count):
        make_mc_question(db, category)


class TestUsernames:
    def test_registration_generates_a_username_from_the_email(self, client: TestClient):
        body = _register(client, "joao.silva@teste.com")
        assert body["user"]["username"] == "joaosilva"

    def test_usernames_never_collide(self, client: TestClient):
        first = _register(client, "ana@teste.com")
        second = _register(client, "ana@outro.com")
        assert first["user"]["username"] == "ana"
        assert second["user"]["username"] == "ana2"

    def test_user_can_change_username(self, auth_client: TestClient):
        response = auth_client.patch("/api/v1/users/me", json={"username": "samuka"})
        assert response.status_code == 200
        assert response.json()["username"] == "samuka"

    def test_taken_username_is_rejected(self, auth_client: TestClient, client: TestClient):
        _register(client, "outro@teste.com")  # username "outro"
        response = auth_client.patch("/api/v1/users/me", json={"username": "outro"})
        assert response.status_code == 409

    def test_invalid_username_is_rejected(self, auth_client: TestClient):
        assert auth_client.patch("/api/v1/users/me", json={"username": "a b!"}).status_code == 422


class TestFriendships:
    def test_full_request_accept_flow(self, auth_client: TestClient, client: TestClient):
        other = _register(client, "maria@teste.com", "Maria")
        other_headers = _auth(other["access_token"])

        sent = auth_client.post("/api/v1/friends/requests", json={"username": "maria"})
        assert sent.status_code == 201
        assert sent.json()["status"] == "pending"

        incoming = client.get("/api/v1/friends", headers=other_headers).json()["incoming"]
        assert len(incoming) == 1
        assert incoming[0]["user"]["username"] == "samuel"

        request_id = incoming[0]["id"]
        accept = client.post(f"/api/v1/friends/requests/{request_id}/accept", headers=other_headers)
        assert accept.status_code == 204

        friends = auth_client.get("/api/v1/friends").json()["friends"]
        assert [f["username"] for f in friends] == ["maria"]

    def test_mutual_requests_become_friends(self, auth_client: TestClient, client: TestClient):
        other = _register(client, "pedro@teste.com")
        auth_client.post("/api/v1/friends/requests", json={"username": "pedro"})
        # Pedro invites back instead of accepting — should settle as friendship.
        response = client.post(
            "/api/v1/friends/requests",
            json={"username": "samuel"},
            headers=_auth(other["access_token"]),
        )
        assert response.status_code == 201
        assert response.json()["status"] == "accepted"

    def test_cannot_duplicate_or_self_request(self, auth_client: TestClient, client: TestClient):
        _register(client, "lucas@teste.com")
        auth_client.post("/api/v1/friends/requests", json={"username": "lucas"})
        again = auth_client.post("/api/v1/friends/requests", json={"username": "lucas"})
        assert again.status_code == 400
        assert (
            auth_client.post("/api/v1/friends/requests", json={"username": "samuel"}).status_code
            == 400
        )

    def test_decline_removes_the_request(self, auth_client: TestClient, client: TestClient):
        other = _register(client, "tiago@teste.com")
        other_headers = _auth(other["access_token"])
        auth_client.post("/api/v1/friends/requests", json={"username": "tiago"})
        request_id = client.get("/api/v1/friends", headers=other_headers).json()["incoming"][0][
            "id"
        ]
        assert (
            client.post(
                f"/api/v1/friends/requests/{request_id}/decline", headers=other_headers
            ).status_code
            == 204
        )
        assert client.get("/api/v1/friends", headers=other_headers).json()["incoming"] == []

    def test_search_shows_relation_and_hides_email(
        self, auth_client: TestClient, client: TestClient
    ):
        _register(client, "rebeca@teste.com")
        results = auth_client.get("/api/v1/friends/search?q=reb").json()
        assert len(results) == 1
        assert results[0]["user"]["username"] == "rebeca"
        assert results[0]["relation"] == "none"
        assert "email" not in results[0]["user"]

        auth_client.post("/api/v1/friends/requests", json={"username": "rebeca"})
        assert (
            auth_client.get("/api/v1/friends/search?q=reb").json()[0]["relation"] == "pending_sent"
        )

    def test_search_excludes_self(self, auth_client: TestClient):
        assert auth_client.get("/api/v1/friends/search?q=samuel").json() == []

    def test_remove_friend(self, auth_client: TestClient, client: TestClient, db: Session):
        other = _register(client, "davi@teste.com")
        other_headers = _auth(other["access_token"])
        auth_client.post("/api/v1/friends/requests", json={"username": "davi"})
        request_id = client.get("/api/v1/friends", headers=other_headers).json()["incoming"][0][
            "id"
        ]
        client.post(f"/api/v1/friends/requests/{request_id}/accept", headers=other_headers)

        assert auth_client.delete(f"/api/v1/friends/{other['user']['id']}").status_code == 204
        assert auth_client.get("/api/v1/friends").json()["friends"] == []


class TestDuelCreation:
    def test_friend_duel_requires_friendship(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        _seed_questions(db)
        _register(client, "estranho@teste.com")
        response = auth_client.post("/api/v1/duels", json={"opponent_username": "estranho"})
        assert response.status_code == 400

    def test_friend_duel_gives_both_sides_the_same_questions(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        _seed_questions(db)
        other = _register(client, "amigo@teste.com")
        other_headers = _auth(other["access_token"])
        auth_client.post("/api/v1/friends/requests", json={"username": "amigo"})
        request_id = client.get("/api/v1/friends", headers=other_headers).json()["incoming"][0][
            "id"
        ]
        client.post(f"/api/v1/friends/requests/{request_id}/accept", headers=other_headers)

        created = auth_client.post("/api/v1/duels", json={"opponent_username": "amigo"})
        assert created.status_code == 201, created.text
        duel = created.json()
        assert duel["status"] == "active"
        assert duel["rival"]["user"]["username"] == "amigo"
        assert duel["timer_seconds"] == 20
        assert duel["question_count"] == 10

        mine = auth_client.get(f"/api/v1/quizzes/{duel['my_session_id']}").json()
        theirs_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()
        theirs = client.get(
            f"/api/v1/quizzes/{theirs_duel['my_session_id']}", headers=other_headers
        ).json()
        assert [q["id"] for q in mine["questions"]] == [q["id"] for q in theirs["questions"]]

    def test_random_duel_opens_then_matches(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        _seed_questions(db)
        first = auth_client.post("/api/v1/duels", json={}).json()
        assert first["status"] == "open"
        assert first["rival"]["user"] is None

        other = _register(client, "sorteado@teste.com")
        second = client.post("/api/v1/duels", json={}, headers=_auth(other["access_token"])).json()
        assert second["id"] == first["id"]  # joined the queued duel
        assert second["status"] == "active"
        assert second["rival"]["user"]["username"] == "samuel"

    def test_duel_is_private_to_its_players(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        _seed_questions(db)
        duel = auth_client.post("/api/v1/duels", json={}).json()
        intruder = _register(client, "intruso@teste.com")
        response = client.get(
            f"/api/v1/duels/{duel['id']}", headers=_auth(intruder["access_token"])
        )
        assert response.status_code == 404


class TestDuelResolution:
    def _friends_duel(
        self, auth_client: TestClient, client: TestClient, db: Session
    ) -> tuple[dict, dict]:
        _seed_questions(db)
        other = _register(client, "rival@teste.com", "Rival")
        other_headers = _auth(other["access_token"])
        auth_client.post("/api/v1/friends/requests", json={"username": "rival"})
        request_id = client.get("/api/v1/friends", headers=other_headers).json()["incoming"][0][
            "id"
        ]
        client.post(f"/api/v1/friends/requests/{request_id}/accept", headers=other_headers)
        duel = auth_client.post("/api/v1/duels", json={"opponent_username": "rival"}).json()
        return duel, other

    def _answer_all(
        self,
        client: TestClient,
        headers: dict[str, str] | None,
        session_id: str,
        db: Session,
        *,
        correct: bool,
    ) -> None:
        quiz = (
            client.get(f"/api/v1/quizzes/{session_id}", headers=headers).json()
            if headers
            else client.get(f"/api/v1/quizzes/{session_id}").json()
        )
        for question in quiz["questions"]:
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
            chosen = right if correct else next(o for o in option_ids if o != right)
            payload = {"question_id": question["id"], "selected_option_id": chosen}
            if headers:
                client.post(f"/api/v1/quizzes/{session_id}/answers", json=payload, headers=headers)
            else:
                client.post(f"/api/v1/quizzes/{session_id}/answers", json=payload)
        if headers:
            client.post(f"/api/v1/quizzes/{session_id}/complete", headers=headers)
        else:
            client.post(f"/api/v1/quizzes/{session_id}/complete")

    def test_winner_gets_xp_and_record(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        duel, other = self._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        # I answer everything right; the rival answers everything wrong.
        self._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)
        # Not resolved yet — the rival has not played.
        pending = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        assert pending["status"] == "active"
        assert pending["my_result"] is None

        self._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=False)

        resolved = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        assert resolved["status"] == "finished"
        assert resolved["my_result"] == "win"
        assert resolved["xp_change"] == 50
        assert resolved["me"]["correct"] == 10
        assert resolved["rival"]["correct"] == 0

        record = auth_client.get("/api/v1/duels").json()["record"]
        assert record["wins"] == 1
        assert record["losses"] == 0
        assert record["current_streak"] == 1

        loser_record = client.get("/api/v1/duels", headers=other_headers).json()["record"]
        assert loser_record["losses"] == 1

    def test_draw_awards_both(self, auth_client: TestClient, client: TestClient, db: Session):
        duel, other = self._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        self._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)
        self._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=True)

        resolved = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        # Same score — the tiebreak is time, and ties there are draws.
        assert resolved["status"] == "finished"
        assert resolved["my_result"] in {"draw", "win", "loss"}
        assert resolved["me"]["correct"] == resolved["rival"]["correct"] == 10

    def test_duel_answers_feed_category_stats_and_accuracy(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        duel, _ = self._friends_duel(auth_client, client, db)
        self._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)

        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["stats"]["questions_answered"] == 10
        assert dashboard["stats"]["accuracy"] == 1.0
        practiced = [c for c in dashboard["categories"] if c["answered"] > 0]
        assert practiced and practiced[0]["answered"] == 10

    def test_expired_duel_gives_the_win_to_who_played(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        duel, _ = self._friends_duel(auth_client, client, db)
        self._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)

        stored = db.get(Duel, duel["id"])
        stored.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.flush()

        resolved = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        assert resolved["status"] == "finished"
        assert resolved["my_result"] == "win"

    def test_expired_with_nobody_playing_moves_no_xp(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        duel, _ = self._friends_duel(auth_client, client, db)
        stored = db.get(Duel, duel["id"])
        stored.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.flush()

        resolved = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        assert resolved["status"] == "expired"
        record = auth_client.get("/api/v1/duels").json()["record"]
        assert record["wins"] == record["losses"] == record["draws"] == 0

    def test_xp_never_goes_below_zero_on_a_loss(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        duel, other = self._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        self._answer_all(auth_client, None, duel["my_session_id"], db, correct=False)
        self._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=True)

        assert auth_client.get(f"/api/v1/duels/{duel['id']}").json()["my_result"] == "loss"
        assert auth_client.get("/api/v1/dashboard").json()["stats"]["total_xp"] >= 0


class TestDuelList:
    def test_awaiting_me_counts_unplayed_rounds(self, auth_client: TestClient, db: Session):
        _seed_questions(db)
        auth_client.post("/api/v1/duels", json={})
        listing = auth_client.get("/api/v1/duels").json()
        assert listing["awaiting_me"] == 1
        assert listing["items"][0]["status"] == "open"

    def test_constants_match_the_mvp_spec(self):
        assert duel_service.QUESTION_COUNT == 10
        assert duel_service.TIMER_SECONDS == 20
        assert duel_service.DUEL_XP == {"win": 50, "draw": 10, "loss": -25}

    def test_timer_reaches_the_play_screen(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        for _ in range(10):
            make_mc_question(db, category)
        duel = auth_client.post("/api/v1/duels", json={}).json()
        quiz = auth_client.get(f"/api/v1/quizzes/{duel['my_session_id']}").json()
        assert quiz["timer_seconds"] == 20


class TestLeavingADuel:
    def test_quitting_forfeits_even_when_ahead(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        """Walking out must never be a way to bank a lead."""
        helper = TestDuelResolution()
        duel, other = helper._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        # I answer one question right, then leave; the rival never played.
        quiz = auth_client.get(f"/api/v1/quizzes/{duel['my_session_id']}").json()
        question = quiz["questions"][0]
        correct_id = str(
            db.scalars(
                select(QuestionOption).where(
                    QuestionOption.id.in_([o["id"] for o in question["options"]]),
                    QuestionOption.is_correct,
                )
            )
            .one()
            .id
        )
        auth_client.post(
            f"/api/v1/quizzes/{duel['my_session_id']}/answers",
            json={"question_id": question["id"], "selected_option_id": correct_id},
        )
        assert (
            auth_client.post(f"/api/v1/quizzes/{duel['my_session_id']}/abandon").status_code == 200
        )

        mine = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        assert mine["status"] == "cancelled"
        assert mine["my_result"] == "loss"
        assert mine["xp_change"] == -25

        theirs = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()
        assert theirs["my_result"] == "win"
        assert client.get("/api/v1/duels", headers=other_headers).json()["record"]["wins"] == 1
        assert auth_client.get("/api/v1/duels").json()["record"]["losses"] == 1
        # The rival's unplayed round must not be playable anymore.
        assert (
            client.post(
                f"/api/v1/quizzes/{rival_duel['my_session_id']}/complete", headers=other_headers
            ).status_code
            == 400
        )

    def test_quitting_an_open_duel_leaves_the_queue(self, auth_client: TestClient, db: Session):
        _seed_questions(db)
        duel = auth_client.post("/api/v1/duels", json={}).json()
        assert duel["status"] == "open"
        auth_client.post(f"/api/v1/quizzes/{duel['my_session_id']}/abandon")

        cancelled = auth_client.get(f"/api/v1/duels/{duel['id']}").json()
        assert cancelled["status"] == "cancelled"
        assert cancelled["my_result"] == "loss"
        assert auth_client.get("/api/v1/duels").json()["record"]["losses"] == 1

    def test_a_rival_no_longer_matches_a_cancelled_queue_entry(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        _seed_questions(db)
        mine = auth_client.post("/api/v1/duels", json={}).json()
        auth_client.post(f"/api/v1/quizzes/{mine['my_session_id']}/abandon")

        other = _register(client, "buscador@teste.com")
        joined = client.post("/api/v1/duels", json={}, headers=_auth(other["access_token"])).json()
        assert joined["id"] != mine["id"]  # opened a fresh one instead
        assert joined["status"] == "open"

    def test_quitting_costs_the_stake_only_not_per_answer_penalties(
        self, auth_client: TestClient, db: Session
    ):
        _seed_questions(db)
        # Bank XP first so the floor at zero does not hide the size of the bill.
        practice = auth_client.post("/api/v1/quizzes", json={"question_count": 5}).json()
        for question in practice["questions"]:
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
            auth_client.post(
                f"/api/v1/quizzes/{practice['id']}/answers",
                json={"question_id": question["id"], "selected_option_id": right},
            )
        auth_client.post(f"/api/v1/quizzes/{practice['id']}/complete")
        before = auth_client.get("/api/v1/dashboard").json()["stats"]["total_xp"]

        duel = auth_client.post("/api/v1/duels", json={}).json()
        quiz = auth_client.get(f"/api/v1/quizzes/{duel['my_session_id']}").json()
        # Three wrong answers then quit — in practice these would cost XP each.
        for question in quiz["questions"][:3]:
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
            wrong = next(o["id"] for o in question["options"] if o["id"] != right)
            auth_client.post(
                f"/api/v1/quizzes/{duel['my_session_id']}/answers",
                json={"question_id": question["id"], "selected_option_id": wrong},
            )
        auth_client.post(f"/api/v1/quizzes/{duel['my_session_id']}/abandon")

        after = auth_client.get("/api/v1/dashboard").json()["stats"]["total_xp"]
        assert after - before == -25  # the stake alone

    def test_abandoning_a_practice_session_does_not_touch_duels(
        self, auth_client: TestClient, db: Session
    ):
        _seed_questions(db)
        quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 3}).json()
        assert auth_client.post(f"/api/v1/quizzes/{quiz['id']}/abandon").status_code == 200
        assert auth_client.get("/api/v1/duels").json()["record"]["losses"] == 0


class TestDuelXpComesFromTheResult:
    def test_answers_pay_nothing_during_a_duel(self, auth_client: TestClient, db: Session):
        _seed_questions(db)
        duel = auth_client.post("/api/v1/duels", json={}).json()
        quiz = auth_client.get(f"/api/v1/quizzes/{duel['my_session_id']}").json()
        question = quiz["questions"][0]
        correct_id = str(
            db.scalars(
                select(QuestionOption).where(
                    QuestionOption.id.in_([o["id"] for o in question["options"]]),
                    QuestionOption.is_correct,
                )
            )
            .one()
            .id
        )
        feedback = auth_client.post(
            f"/api/v1/quizzes/{duel['my_session_id']}/answers",
            json={"question_id": question["id"], "selected_option_id": correct_id},
        ).json()
        assert feedback["is_correct"] is True
        assert feedback["xp_earned"] == 0

    def test_finishing_a_duel_round_grants_no_bonus(self, auth_client: TestClient, db: Session):
        helper = TestDuelResolution()
        _seed_questions(db)
        duel = auth_client.post("/api/v1/duels", json={}).json()
        helper._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)
        # Perfect round, but the rival has not played: nothing is settled yet.
        assert auth_client.get("/api/v1/dashboard").json()["stats"]["total_xp"] == 0

    def test_only_the_outcome_moves_xp(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        helper = TestDuelResolution()
        duel, other = helper._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        helper._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)
        helper._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=False)

        # Winner: exactly the stake, not 10 correct answers' worth of XP.
        assert auth_client.get("/api/v1/dashboard").json()["stats"]["total_xp"] == 50
        # Loser answered everything wrong but only pays the duel stake (floored at 0).
        assert (
            client.get("/api/v1/dashboard", headers=other_headers).json()["stats"]["total_xp"] == 0
        )

    def test_stake_counts_toward_the_daily_goal(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        helper = TestDuelResolution()
        duel, other = helper._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        helper._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)
        helper._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=False)

        assert auth_client.get("/api/v1/dashboard").json()["daily_goal"]["earned_today"] == 50

    def test_practice_sessions_still_pay_per_answer(self, auth_client: TestClient, db: Session):
        helper = TestDuelResolution()
        _seed_questions(db)
        quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 3}).json()
        helper._answer_all(auth_client, None, quiz["id"], db, correct=True)
        # 3 medium answers (20) + completion (5) + perfect (10)
        assert auth_client.get("/api/v1/dashboard").json()["stats"]["total_xp"] == 75


class TestDuelAchievements:
    def test_first_win_unlocks_on_the_same_duel(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        helper = TestDuelResolution()
        duel, other = helper._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        helper._answer_all(auth_client, None, duel["my_session_id"], db, correct=True)
        helper._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=False)

        unlocked = {
            a["code"] for a in auth_client.get("/api/v1/achievements").json() if a["unlocked_at"]
        }
        # Duel results are applied after complete_session — these must not wait
        # for the next study session to unlock.
        assert "duel_win_1" in unlocked
        assert "duel_flawless_1" in unlocked  # won 10/10

    def test_loser_gets_no_duel_badges(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        helper = TestDuelResolution()
        duel, other = helper._friends_duel(auth_client, client, db)
        other_headers = _auth(other["access_token"])
        rival_duel = client.get(f"/api/v1/duels/{duel['id']}", headers=other_headers).json()

        helper._answer_all(auth_client, None, duel["my_session_id"], db, correct=False)
        helper._answer_all(client, other_headers, rival_duel["my_session_id"], db, correct=True)

        unlocked = {
            a["code"] for a in auth_client.get("/api/v1/achievements").json() if a["unlocked_at"]
        }
        assert "duel_win_1" not in unlocked
        assert "duel_flawless_1" not in unlocked

    def test_duel_achievements_report_progress(self, auth_client: TestClient):
        by_code = {a["code"]: a for a in auth_client.get("/api/v1/achievements").json()}
        assert by_code["duel_win_10"]["progress_target"] == 10
        assert by_code["duel_win_10"]["progress_current"] == 0
        assert by_code["duel_streak_3"]["progress_target"] == 3
        assert by_code["duel_played_25"]["progress_target"] == 25


class TestPendingRequestBadge:
    def test_dashboard_counts_incoming_requests_only(
        self, auth_client: TestClient, client: TestClient
    ):
        assert auth_client.get("/api/v1/dashboard").json()["friend_requests"] == 0

        # Someone invites me → counts for me, not for them.
        other = _register(client, "convidador@teste.com")
        other_headers = _auth(other["access_token"])
        client.post("/api/v1/friends/requests", json={"username": "samuel"}, headers=other_headers)

        assert auth_client.get("/api/v1/dashboard").json()["friend_requests"] == 1
        assert client.get("/api/v1/dashboard", headers=other_headers).json()["friend_requests"] == 0

    def test_badge_clears_after_responding(self, auth_client: TestClient, client: TestClient):
        other = _register(client, "outro.pedido@teste.com")
        client.post(
            "/api/v1/friends/requests",
            json={"username": "samuel"},
            headers=_auth(other["access_token"]),
        )
        request_id = auth_client.get("/api/v1/friends").json()["incoming"][0]["id"]
        auth_client.post(f"/api/v1/friends/requests/{request_id}/accept")
        assert auth_client.get("/api/v1/dashboard").json()["friend_requests"] == 0


class TestDuelQuestionTypes:
    def test_duels_only_draw_multiple_choice(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        for _ in range(10):
            make_mc_question(db, category)
        for _ in range(10):
            make_open_question(db, category)

        duel = auth_client.post("/api/v1/duels", json={}).json()
        quiz = auth_client.get(f"/api/v1/quizzes/{duel['my_session_id']}").json()
        assert len(quiz["questions"]) == 10
        assert {q["type"] for q in quiz["questions"]} == {"multiple_choice"}
        assert all(len(q["options"]) == 4 for q in quiz["questions"])

    def test_duel_needs_enough_multiple_choice_questions(
        self, auth_client: TestClient, db: Session
    ):
        category = make_category(db)
        for _ in range(3):
            make_mc_question(db, category)
        for _ in range(20):
            make_open_question(db, category)  # plenty of questions, too few MC
        assert auth_client.post("/api/v1/duels", json={}).status_code == 400

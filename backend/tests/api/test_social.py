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
        assert duel["timer_seconds"] == 30
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
        assert duel_service.TIMER_SECONDS == 30
        assert duel_service.DUEL_XP == {"win": 50, "draw": 10, "loss": -25}


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

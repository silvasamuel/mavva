from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReviewItem
from tests.factories import make_category, make_mc_question, make_open_question


def _start_quiz(client: TestClient, question_count: int = 3) -> dict:
    response = client.post("/api/v1/quizzes", json={"question_count": question_count})
    assert response.status_code == 201, response.text
    return response.json()


def _correct_option_id(db: Session, question_payload: dict) -> str:
    from app.models import QuestionOption

    option_ids = [o["id"] for o in question_payload["options"]]
    correct = db.scalars(
        select(QuestionOption).where(QuestionOption.id.in_(option_ids), QuestionOption.is_correct)
    ).one()
    return str(correct.id)


class TestQuizFlow:
    def _seed_bank(self, db: Session) -> None:
        category = make_category(db)
        for _ in range(2):
            make_mc_question(db, category)
        make_open_question(db, category)

    def test_questions_never_leak_answer_key(self, auth_client: TestClient, db: Session):
        self._seed_bank(db)
        quiz = _start_quiz(auth_client)
        for question in quiz["questions"]:
            for option in question["options"]:
                assert "is_correct" not in option
            assert "accepted_answers" not in question
            assert "explanation" not in question

    def test_full_session_updates_stats_streak_and_srs(self, auth_client: TestClient, db: Session):
        self._seed_bank(db)
        quiz = _start_quiz(auth_client)
        session_id = quiz["id"]

        for question in quiz["questions"]:
            if question["type"] == "multiple_choice":
                payload = {
                    "question_id": question["id"],
                    "selected_option_id": _correct_option_id(db, question),
                }
            else:
                payload = {"question_id": question["id"], "answer_text": "jesus"}
            response = auth_client.post(f"/api/v1/quizzes/{session_id}/answers", json=payload)
            assert response.status_code == 200, response.text
            feedback = response.json()
            assert feedback["is_correct"] is True
            assert feedback["explanation"]
            assert feedback["reference"]["display"]
            assert feedback["xp_earned"] > 0

        complete = auth_client.post(f"/api/v1/quizzes/{session_id}/complete")
        assert complete.status_code == 200, complete.text
        summary = complete.json()
        assert summary["correct_count"] == 3
        assert summary["accuracy"] == 1.0
        # 3 medium answers (20 XP) + completion (5) + perfect (10)
        assert summary["xp_earned"] == 75
        assert summary["streak"]["current"] == 1
        assert summary["streak"]["extended_today"] is True
        codes = {a["code"] for a in summary["unlocked_achievements"]}
        assert "perfect_1" in codes

        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["stats"]["total_xp"] == 75
        assert dashboard["stats"]["current_streak"] == 1
        assert dashboard["stats"]["questions_answered"] == 3

        review_items = db.scalars(select(ReviewItem)).all()
        assert len(review_items) == 3
        assert all(item.due_date == date.today() + timedelta(days=1) for item in review_items)

    def test_wrong_answer_gives_no_xp_and_reveals_correction(
        self, auth_client: TestClient, db: Session
    ):
        category = make_category(db)
        make_mc_question(db, category)
        quiz = _start_quiz(auth_client, question_count=1)
        question = quiz["questions"][0]
        wrong_option = next(
            o["id"] for o in question["options"] if o["id"] != _correct_option_id(db, question)
        )
        response = auth_client.post(
            f"/api/v1/quizzes/{quiz['id']}/answers",
            json={"question_id": question["id"], "selected_option_id": wrong_option},
        )
        feedback = response.json()
        assert feedback["is_correct"] is False
        # Wrong medium answer costs half its value (-10).
        assert feedback["xp_earned"] == -10
        assert feedback["correct_option_id"] == _correct_option_id(db, question)

    def test_cannot_answer_same_question_twice(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        make_mc_question(db, category)
        quiz = _start_quiz(auth_client, question_count=1)
        question = quiz["questions"][0]
        payload = {
            "question_id": question["id"],
            "selected_option_id": _correct_option_id(db, question),
        }
        assert (
            auth_client.post(f"/api/v1/quizzes/{quiz['id']}/answers", json=payload).status_code
            == 200
        )
        assert (
            auth_client.post(f"/api/v1/quizzes/{quiz['id']}/answers", json=payload).status_code
            == 400
        )

    def test_empty_filters_yield_400(self, auth_client: TestClient, db: Session):
        response = auth_client.post("/api/v1/quizzes", json={"question_count": 5})
        assert response.status_code == 400

    def test_review_mode_uses_due_items(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        question = make_mc_question(db, category)
        quiz = _start_quiz(auth_client, question_count=1)
        wrong_option = next(
            o["id"]
            for o in quiz["questions"][0]["options"]
            if o["id"] != _correct_option_id(db, quiz["questions"][0])
        )
        auth_client.post(
            f"/api/v1/quizzes/{quiz['id']}/answers",
            json={"question_id": quiz["questions"][0]["id"], "selected_option_id": wrong_option},
        )

        # Wrong answer scheduled the item for tomorrow — force it due today.
        item = db.scalars(select(ReviewItem)).one()
        item.due_date = date.today()
        db.flush()

        response = auth_client.post("/api/v1/quizzes", json={"mode": "review", "question_count": 5})
        assert response.status_code == 201
        review_quiz = response.json()
        assert review_quiz["mode"] == "review"
        assert [q["id"] for q in review_quiz["questions"]] == [str(question.id)]

    def test_review_mode_with_nothing_due_is_400(self, auth_client: TestClient, db: Session):
        response = auth_client.post("/api/v1/quizzes", json={"mode": "review"})
        assert response.status_code == 400

    def test_session_isolation_between_users(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        make_mc_question(db, category)
        quiz = _start_quiz(auth_client, question_count=1)

        other = auth_client.post(
            "/api/v1/auth/register",
            json={"name": "Intruso", "email": "outro@teste.com", "password": "senha-forte-123"},
        ).json()
        response = auth_client.get(
            f"/api/v1/quizzes/{quiz['id']}",
            headers={"Authorization": f"Bearer {other['access_token']}"},
        )
        assert response.status_code == 404


class TestXpPenalty:
    def test_negative_session_floors_lifetime_xp_at_zero(
        self, auth_client: TestClient, db: Session
    ):
        category = make_category(db)
        make_mc_question(db, category)
        quiz = _start_quiz(auth_client, question_count=1)
        question = quiz["questions"][0]
        wrong_option = next(
            o["id"] for o in question["options"] if o["id"] != _correct_option_id(db, question)
        )
        auth_client.post(
            f"/api/v1/quizzes/{quiz['id']}/answers",
            json={"question_id": question["id"], "selected_option_id": wrong_option},
        )
        summary = auth_client.post(f"/api/v1/quizzes/{quiz['id']}/complete").json()
        # -10 (wrong medium) + 5 (completion) = -5 for the session...
        assert summary["xp_earned"] == -5
        # ...but the lifetime total never goes below zero.
        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["stats"]["total_xp"] == 0


class TestSmartQueue:
    def test_correctly_answered_questions_sink_to_the_back(
        self, auth_client: TestClient, db: Session
    ):
        category = make_category(db)
        questions = [make_mc_question(db, category) for _ in range(3)]

        # Answer only the first question, correctly.
        quiz = _start_quiz(auth_client, question_count=3)
        first = quiz["questions"][0]
        auth_client.post(
            f"/api/v1/quizzes/{quiz['id']}/answers",
            json={"question_id": first["id"], "selected_option_id": _correct_option_id(db, first)},
        )

        # A new 2-question session must prefer the two questions never answered.
        new_quiz = _start_quiz(auth_client, question_count=2)
        drawn_ids = {q["id"] for q in new_quiz["questions"]}
        assert first["id"] not in drawn_ids
        assert drawn_ids <= {str(q.id) for q in questions}

    def test_answered_questions_still_appear_when_pool_is_small(
        self, auth_client: TestClient, db: Session
    ):
        category = make_category(db)
        make_mc_question(db, category)
        quiz = _start_quiz(auth_client, question_count=1)
        question = quiz["questions"][0]
        auth_client.post(
            f"/api/v1/quizzes/{quiz['id']}/answers",
            json={
                "question_id": question["id"],
                "selected_option_id": _correct_option_id(db, question),
            },
        )
        # Only one question exists — it must come back rather than blocking play.
        again = _start_quiz(auth_client, question_count=1)
        assert again["questions"][0]["id"] == question["id"]

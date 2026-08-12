"""The answer position must not be inferable from the API itself."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import QuestionOption
from app.services.option_shuffle import shuffled_for
from tests.factories import make_category, make_mc_question


def _correct_index(db: Session, question_payload: dict) -> int:
    option_ids = [o["id"] for o in question_payload["options"]]
    correct = db.scalars(
        select(QuestionOption).where(QuestionOption.id.in_(option_ids), QuestionOption.is_correct)
    ).one()
    return option_ids.index(str(correct.id))


class TestShuffleHelper:
    def test_stable_for_the_same_session_and_question(self):
        items = ["a", "b", "c", "d"]
        session_id, question_id = uuid.uuid4(), uuid.uuid4()
        assert shuffled_for(items, session_id, question_id) == shuffled_for(
            items, session_id, question_id
        )

    def test_is_a_permutation_and_does_not_mutate(self):
        items = ["a", "b", "c", "d"]
        result = shuffled_for(items, uuid.uuid4(), uuid.uuid4())
        assert sorted(result) == sorted(items)
        assert items == ["a", "b", "c", "d"]

    def test_order_varies_across_sessions(self):
        items = ["a", "b", "c", "d"]
        question_id = uuid.uuid4()
        orders = {tuple(shuffled_for(items, uuid.uuid4(), question_id)) for _ in range(40)}
        assert len(orders) > 1


class TestApiOptionOrder:
    def test_correct_answer_is_not_always_first(self, auth_client: TestClient, db: Session):
        """Seed files store the right option first — the API must not reveal that."""
        category = make_category(db)
        for _ in range(20):
            make_mc_question(db, category)

        positions = []
        for _ in range(8):
            quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 10}).json()
            positions += [_correct_index(db, q) for q in quiz["questions"]]

        # Picking index 0 every time must not be a winning strategy.
        assert len(set(positions)) > 1
        first_rate = positions.count(0) / len(positions)
        assert first_rate < 0.6, f"resposta correta veio em 1º em {first_rate:.0%} das perguntas"

    def test_order_is_stable_across_reloads(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        for _ in range(10):
            make_mc_question(db, category)
        quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 5}).json()
        again = auth_client.get(f"/api/v1/quizzes/{quiz['id']}").json()
        for before, after in zip(quiz["questions"], again["questions"], strict=True):
            assert [o["id"] for o in before["options"]] == [o["id"] for o in after["options"]]

    def test_answering_still_works_after_shuffling(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        make_mc_question(db, category)
        quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 1}).json()
        question = quiz["questions"][0]
        correct_id = question["options"][_correct_index(db, question)]["id"]
        feedback = auth_client.post(
            f"/api/v1/quizzes/{quiz['id']}/answers",
            json={"question_id": question["id"], "selected_option_id": correct_id},
        ).json()
        assert feedback["is_correct"] is True

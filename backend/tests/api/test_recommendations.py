from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import QuestionOption
from tests.factories import make_category, make_mc_question


def _answer(
    client: TestClient, db: Session, session_id: str, question: dict, correct: bool
) -> None:
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
    client.post(
        f"/api/v1/quizzes/{session_id}/answers",
        json={"question_id": question["id"], "selected_option_id": chosen},
    )


def _play_category(
    client: TestClient, db: Session, category_id: int, *, right: int, wrong: int
) -> None:
    total = right + wrong
    quiz = client.post(
        "/api/v1/quizzes", json={"question_count": total, "category_ids": [category_id]}
    ).json()
    for index, question in enumerate(quiz["questions"]):
        _answer(client, db, quiz["id"], question, correct=index < right)
    client.post(f"/api/v1/quizzes/{quiz['id']}/complete")


class TestWeakestCategoryRecommendation:
    def test_considers_categories_with_few_answers(self, auth_client: TestClient, db: Session):
        """A category answered only a handful of times must still be eligible."""
        strong = make_category(db, slug="fortes")
        weak = make_category(db, slug="fracos")
        for _ in range(6):
            make_mc_question(db, strong)
            make_mc_question(db, weak)

        _play_category(auth_client, db, strong.id, right=5, wrong=0)  # 100%
        _play_category(auth_client, db, weak.id, right=1, wrong=3)  # 25%, only 4 answers

        recommendations = auth_client.get("/api/v1/dashboard").json()["recommendations"]
        weak_recs = [r for r in recommendations if r["type"] == "category"]
        assert any(r["category_slug"] == "fracos" for r in weak_recs), recommendations

    def test_ties_prefer_the_category_with_more_evidence(
        self, auth_client: TestClient, db: Session
    ):
        few = make_category(db, slug="poucas")
        many = make_category(db, slug="muitas")
        for _ in range(8):
            make_mc_question(db, few)
            make_mc_question(db, many)

        _play_category(auth_client, db, few.id, right=0, wrong=2)  # 0% over 2
        _play_category(auth_client, db, many.id, right=0, wrong=6)  # 0% over 6

        recommendations = auth_client.get("/api/v1/dashboard").json()["recommendations"]
        weakest = next(r for r in recommendations if r["type"] == "category")
        assert weakest["category_slug"] == "muitas"

    def test_strong_categories_are_not_recommended(self, auth_client: TestClient, db: Session):
        category = make_category(db, slug="dominadas")
        for _ in range(6):
            make_mc_question(db, category)
        _play_category(auth_client, db, category.id, right=5, wrong=0)

        recommendations = auth_client.get("/api/v1/dashboard").json()["recommendations"]
        assert all(r["category_slug"] != "dominadas" for r in recommendations)

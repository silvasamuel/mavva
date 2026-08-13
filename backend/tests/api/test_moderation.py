from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Question, User
from app.models.enums import UserRole
from tests.factories import make_category, make_mc_question


def _promote_to_admin(db: Session, email: str = "samuel@teste.com") -> None:
    user = db.query(User).filter(User.email == email).one()
    user.role = UserRole.ADMIN
    db.flush()


def _draft(category_id: int) -> dict:
    return {
        "category_id": category_id,
        "type": "multiple_choice",
        "text": "Quem construiu a arca segundo o livro de Gênesis?",
        "options": [
            {"text": "Noé", "correct": True},
            {"text": "Moisés", "correct": False},
            {"text": "Abraão", "correct": False},
            {"text": "Davi", "correct": False},
        ],
        "explanation": "Gênesis narra que Noé construiu a arca por ordem de Deus.",
        "book": "genesis",
        "chapter": 6,
        "verse_start": 14,
        "difficulty": "easy",
    }


class TestQuestionFlags:
    def test_player_can_report_once(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        question = make_mc_question(db, category)
        quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 1}).json()
        response = auth_client.post(
            "/api/v1/flags",
            json={
                "question_id": str(question.id),
                "reason": "wrong_answer",
                "comment": "A alternativa correta parece invertida.",
                "session_id": quiz["id"],
            },
        )
        assert response.status_code == 201, response.text
        again = auth_client.post(
            "/api/v1/flags",
            json={"question_id": str(question.id), "reason": "other"},
        )
        assert again.status_code == 400

    def test_cannot_flag_question_from_someone_elses_session(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        category = make_category(db)
        question = make_mc_question(db, category)
        quiz = auth_client.post("/api/v1/quizzes", json={"question_count": 1}).json()
        other = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Outro",
                "email": "outro@teste.com",
                "password": "senha-forte-123",
            },
        ).json()
        response = client.post(
            "/api/v1/flags",
            headers={"Authorization": f"Bearer {other['access_token']}"},
            json={
                "question_id": str(question.id),
                "reason": "wrong_text",
                "session_id": quiz["id"],
            },
        )
        assert response.status_code == 404


class TestQuestionProposals:
    def test_submit_and_admin_approve(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        draft = _draft(category.id)
        created = auth_client.post("/api/v1/proposals", json=draft)
        assert created.status_code == 201, created.text
        assert created.json()["status"] == "pending"

        _promote_to_admin(db)
        inbox = auth_client.get("/api/v1/admin/review").json()
        assert inbox["pending_proposals"] == 1
        proposal_id = inbox["proposals"][0]["id"]

        approved = auth_client.post(
            f"/api/v1/admin/review/proposals/{proposal_id}/approve", json=draft
        )
        assert approved.status_code == 200, approved.text
        question_id = approved.json()["question_id"]
        assert question_id is not None
        question = db.get(Question, UUID(question_id))
        assert question is not None
        assert question.is_active is True
        assert question.external_id.startswith(f"{category.slug}-")
        assert auth_client.get("/api/v1/admin/review").json()["pending_proposals"] == 0

    def test_reject_keeps_question_out_of_the_bank(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        draft = _draft(category.id)
        auth_client.post("/api/v1/proposals", json=draft)
        _promote_to_admin(db)
        proposal_id = auth_client.get("/api/v1/admin/review").json()["proposals"][0]["id"]
        assert (
            auth_client.post(f"/api/v1/admin/review/proposals/{proposal_id}/reject").status_code
            == 204
        )
        assert db.query(Question).count() == 0

    def test_caps_pending_proposals(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        draft = _draft(category.id)
        for _ in range(5):
            assert auth_client.post("/api/v1/proposals", json=draft).status_code == 201
        sixth = auth_client.post("/api/v1/proposals", json=draft)
        assert sixth.status_code == 400


class TestAdminReviewFlags:
    def test_deactivate_hides_question_from_play(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        question = make_mc_question(db, category)
        auth_client.post(
            "/api/v1/flags", json={"question_id": str(question.id), "reason": "wrong_text"}
        )
        _promote_to_admin(db)
        flag_id = auth_client.get("/api/v1/admin/review").json()["flags"][0]["id"]
        assert (
            auth_client.post(f"/api/v1/admin/review/flags/{flag_id}/deactivate").status_code == 204
        )
        db.refresh(question)
        assert question.is_active is False
        assert auth_client.get("/api/v1/admin/review").json()["open_flags"] == 0

    def test_regular_user_cannot_see_inbox(self, auth_client: TestClient):
        assert auth_client.get("/api/v1/admin/review").status_code == 403


class TestCatalogBooks:
    def test_lists_bible_books(self, auth_client: TestClient):
        response = auth_client.get("/api/v1/books")
        assert response.status_code == 200
        slugs = [book["slug"] for book in response.json()]
        assert "genesis" in slugs
        assert "joao" in slugs

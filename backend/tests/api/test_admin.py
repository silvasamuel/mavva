from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.models.enums import UserRole
from tests.factories import make_category, make_mc_question, make_open_question


def _promote_to_admin(db: Session, email: str) -> None:
    user = db.query(User).filter(User.email == email).one()
    user.role = UserRole.ADMIN
    db.flush()


class TestAdminAccessControl:
    """The real security boundary: server-side role checks that no front-end can bypass."""

    def test_regular_user_is_forbidden_everywhere(self, auth_client: TestClient, db: Session):
        category = make_category(db)
        question = make_mc_question(db, category)
        for method, path in [
            ("get", "/api/v1/admin/users"),
            ("get", "/api/v1/admin/questions"),
            ("get", "/api/v1/admin/categories"),
            ("get", f"/api/v1/admin/questions/{question.id}"),
        ]:
            response = getattr(auth_client, method)(path)
            assert response.status_code == 403, f"{path} deveria ser 403"
        patch = auth_client.patch(
            f"/api/v1/admin/questions/{question.id}", json={"text": "hack attempt xxxxx"}
        )
        assert patch.status_code == 403

    def test_unauthenticated_is_401(self, client: TestClient, db: Session):
        assert client.get("/api/v1/admin/users").status_code == 401

    def test_admin_can_list_users_and_questions(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        category = make_category(db)
        make_mc_question(db, category)

        users = auth_client.get("/api/v1/admin/users")
        assert users.status_code == 200
        assert users.json()["total"] >= 1
        assert "accuracy" in users.json()["items"][0]

        questions = auth_client.get("/api/v1/admin/questions")
        assert questions.status_code == 200
        assert questions.json()["total"] >= 1


class TestAdminQuestionEditing:
    def _admin_client(self, auth_client: TestClient, db: Session) -> TestClient:
        _promote_to_admin(db, "samuel@teste.com")
        return auth_client

    def test_edit_multiple_choice_text_and_options(self, auth_client: TestClient, db: Session):
        client = self._admin_client(auth_client, db)
        category = make_category(db)
        question = make_mc_question(db, category)

        response = client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={
                "text": "Pergunta editada pelo admin?",
                "explanation": "Explicação atualizada pelo admin.",
                "options": [
                    {"text": "Nova correta", "is_correct": True},
                    {"text": "Errada 1", "is_correct": False},
                    {"text": "Errada 2", "is_correct": False},
                    {"text": "Errada 3", "is_correct": False},
                ],
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["text"] == "Pergunta editada pelo admin?"
        assert body["options"][0]["text"] == "Nova correta"
        assert sum(1 for o in body["options"] if o["is_correct"]) == 1

    def test_multiple_choice_must_have_exactly_one_correct(
        self, auth_client: TestClient, db: Session
    ):
        client = self._admin_client(auth_client, db)
        category = make_category(db)
        question = make_mc_question(db, category)
        response = client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={
                "options": [
                    {"text": "A", "is_correct": True},
                    {"text": "B", "is_correct": True},
                    {"text": "C", "is_correct": False},
                    {"text": "D", "is_correct": False},
                ]
            },
        )
        assert response.status_code == 400

    def test_edit_open_answer_accepted_answers(self, auth_client: TestClient, db: Session):
        client = self._admin_client(auth_client, db)
        category = make_category(db)
        question = make_open_question(db, category)
        response = client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={"accepted_answers": [{"text": "Resposta A"}, {"text": "Resposta B"}]},
        )
        assert response.status_code == 200, response.text
        assert [a["text"] for a in response.json()["accepted_answers"]] == [
            "Resposta A",
            "Resposta B",
        ]

    def test_cannot_put_options_on_open_answer(self, auth_client: TestClient, db: Session):
        client = self._admin_client(auth_client, db)
        category = make_category(db)
        question = make_open_question(db, category)
        response = client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={
                "options": [
                    {"text": "A", "is_correct": True},
                    {"text": "B", "is_correct": False},
                    {"text": "C", "is_correct": False},
                    {"text": "D", "is_correct": False},
                ]
            },
        )
        assert response.status_code == 400

    def test_invalid_book_rejected(self, auth_client: TestClient, db: Session):
        client = self._admin_client(auth_client, db)
        category = make_category(db)
        question = make_mc_question(db, category)
        response = client.patch(
            f"/api/v1/admin/questions/{question.id}", json={"book": "livro-inexistente"}
        )
        assert response.status_code == 400

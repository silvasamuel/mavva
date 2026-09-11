from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import DailyActivity, User
from app.models.enums import UserRole
from tests.factories import make_category, make_mc_question, make_open_question
from tests.helpers import register_user, verification_tokens


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
            ("get", "/api/v1/admin/dashboard"),
            ("get", "/api/v1/admin/users"),
            ("get", "/api/v1/admin/questions"),
            ("get", "/api/v1/admin/categories"),
            ("get", f"/api/v1/admin/questions/{question.id}"),
            ("get", "/api/v1/admin/users/00000000-0000-0000-0000-000000000001"),
        ]:
            response = getattr(auth_client, method)(path)
            assert response.status_code == 403, f"{path} deveria ser 403"
        patch = auth_client.patch(
            f"/api/v1/admin/questions/{question.id}", json={"text": "hack attempt xxxxx"}
        )
        assert patch.status_code == 403
        me = auth_client.get("/api/v1/users/me").json()
        assert (
            auth_client.patch(
                f"/api/v1/admin/users/{me['id']}", json={"is_active": False}
            ).status_code
            == 403
        )

    def test_unauthenticated_is_401(self, client: TestClient, db: Session):
        assert client.get("/api/v1/admin/dashboard").status_code == 401
        assert client.get("/api/v1/admin/users").status_code == 401

    def test_admin_can_list_users_and_questions(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        category = make_category(db)
        make_mc_question(db, category)

        users = auth_client.get("/api/v1/admin/users")
        assert users.status_code == 200
        assert users.json()["total"] >= 1
        assert "accuracy" in users.json()["items"][0]
        assert "email_verified_at" in users.json()["items"][0]
        assert users.json()["items"][0]["is_active"] is True

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
        original_ids = [option.id for option in question.options]

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
        db.refresh(question)
        assert [o.id for o in question.options] == original_ids

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
        original_answer_ids = [answer.id for answer in question.accepted_answers]
        response = client.patch(
            f"/api/v1/admin/questions/{question.id}",
            json={"accepted_answers": [{"text": "Resposta A"}, {"text": "Resposta B"}]},
        )
        assert response.status_code == 200, response.text
        assert [a["text"] for a in response.json()["accepted_answers"]] == [
            "Resposta A",
            "Resposta B",
        ]
        db.refresh(question)
        assert [a.id for a in question.accepted_answers] == original_answer_ids

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


class TestAdminUsers:
    def test_get_deactivate_and_reactivate(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        register_user(auth_client, name="Maria", email="maria@teste.com")
        verified = auth_client.post(
            "/api/v1/auth/verify-email", json={"token": verification_tokens["maria@teste.com"]}
        )
        assert verified.status_code == 200
        user_id = verified.json()["user"]["id"]

        detail = auth_client.get(f"/api/v1/admin/users/{user_id}")
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert body["email"] == "maria@teste.com"
        assert body["username"]
        assert body["email_verified_at"]
        assert body["is_active"] is True
        assert "duel_wins" in body

        patched = auth_client.patch(f"/api/v1/admin/users/{user_id}", json={"is_active": False})
        assert patched.status_code == 200, patched.text
        assert patched.json()["is_active"] is False

        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "maria@teste.com", "password": "senha-forte-123"},
        )
        assert login.status_code == 403
        assert "inativa" in login.json()["detail"].lower()

        me = auth_client.get("/api/v1/users/me").json()
        deny = auth_client.patch(f"/api/v1/admin/users/{me['id']}", json={"is_active": False})
        assert deny.status_code == 400

        again = auth_client.patch(f"/api/v1/admin/users/{user_id}", json={"is_active": True})
        assert again.status_code == 200
        assert again.json()["is_active"] is True
        assert (
            auth_client.post(
                "/api/v1/auth/login",
                json={"email": "maria@teste.com", "password": "senha-forte-123"},
            ).status_code
            == 200
        )

    def test_unknown_user_is_404(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        assert (
            auth_client.get("/api/v1/admin/users/00000000-0000-0000-0000-000000000001").status_code
            == 404
        )


class TestAdminDashboard:
    def test_returns_aggregate_counts(
        self, auth_client: TestClient, client: TestClient, db: Session
    ):
        _promote_to_admin(db, "samuel@teste.com")
        category = make_category(db)
        make_mc_question(db, category)
        make_open_question(db, category)
        inactive = make_mc_question(db, category)
        inactive.is_active = False
        admin = db.query(User).filter(User.email == "samuel@teste.com").one()
        db.add(
            DailyActivity(
                user_id=admin.id,
                date=datetime.now(ZoneInfo("America/Sao_Paulo")).date(),
                xp=40,
                questions=2,
                correct=1,
                time_seconds=30,
            )
        )
        db.flush()
        register_user(client, name="Pendente", email="pendente@teste.com")

        response = auth_client.get("/api/v1/admin/dashboard")
        assert response.status_code == 200
        body = response.json()
        assert body["users"]["total"] >= 2
        assert body["users"]["active"] >= 1
        assert body["users"]["unverified"] >= 1
        assert body["users"]["new_7d"] >= 2
        assert body["questions"]["total"] == 3
        assert body["questions"]["active"] == 2
        assert body["questions"]["inactive"] == 1
        assert body["questions"]["open_answer"] == 1
        assert body["questions"]["old_testament"] == 2
        assert body["review"]["flags_open"] == 0
        assert body["review"]["proposals_pending"] == 0
        assert body["review"]["pending"] == 0
        assert body["activity"]["studied_today"] == 1
        assert body["activity"]["xp_today"] == 40
        assert body["activity"]["duels_finished"] == 0
        assert body["activity"]["friendships"] == 0
        assert "accuracy" in body["activity"]

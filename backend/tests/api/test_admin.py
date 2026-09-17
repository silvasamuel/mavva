from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import DailyActivity, User, UserStats
from app.models.enums import Difficulty, QuestionType, UserRole
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


class TestAdminQuestionTypeFilter:
    def test_filters_by_multiple_choice_and_open_answer(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        category = make_category(db)
        mc = make_mc_question(db, category)
        op = make_open_question(db, category)

        mc_only = auth_client.get("/api/v1/admin/questions?type=multiple_choice")
        assert mc_only.status_code == 200, mc_only.text
        mc_ids = {item["id"] for item in mc_only.json()["items"]}
        assert str(mc.id) in mc_ids
        assert str(op.id) not in mc_ids
        assert all(item["type"] == "multiple_choice" for item in mc_only.json()["items"])

        open_only = auth_client.get("/api/v1/admin/questions?type=open_answer")
        open_ids = {item["id"] for item in open_only.json()["items"]}
        assert str(op.id) in open_ids
        assert str(mc.id) not in open_ids

    def test_combines_with_difficulty_and_category(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        category = make_category(db)
        easy_open = make_open_question(db, category, difficulty=Difficulty.EASY)
        make_mc_question(db, category, difficulty=Difficulty.EASY)
        make_open_question(db, category, difficulty=Difficulty.HARD)

        response = auth_client.get(
            "/api/v1/admin/questions"
            f"?type={QuestionType.OPEN_ANSWER.value}&difficulty=easy&category_id={category.id}"
        )
        items = response.json()["items"]
        assert [item["id"] for item in items] == [str(easy_open.id)]


class TestAdminUsersSorting:
    def _set_stats(
        self,
        db: Session,
        email: str,
        *,
        total_xp: int = 0,
        current_streak: int = 0,
        questions_answered: int = 0,
        correct_answers: int = 0,
    ) -> None:
        user = db.query(User).filter(User.email == email).one()
        stats = db.get(UserStats, user.id)
        assert stats is not None
        stats.total_xp = total_xp
        stats.current_streak = current_streak
        stats.questions_answered = questions_answered
        stats.correct_answers = correct_answers
        db.flush()

    def test_sort_by_xp_ascending_and_descending(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        register_user(auth_client, name="Baixo XP", email="baixo@teste.com")
        register_user(auth_client, name="Alto XP", email="alto@teste.com")
        self._set_stats(db, "samuel@teste.com", total_xp=50)
        self._set_stats(db, "baixo@teste.com", total_xp=10)
        self._set_stats(db, "alto@teste.com", total_xp=200)

        ascending = auth_client.get("/api/v1/admin/users?sort=xp").json()["items"]
        assert [u["email"] for u in ascending] == [
            "baixo@teste.com",
            "samuel@teste.com",
            "alto@teste.com",
        ]

        descending = auth_client.get("/api/v1/admin/users?sort=-xp").json()["items"]
        assert [u["email"] for u in descending] == [
            "alto@teste.com",
            "samuel@teste.com",
            "baixo@teste.com",
        ]

    def test_sort_by_accuracy_treats_zero_answers_as_lowest(
        self, auth_client: TestClient, db: Session
    ):
        _promote_to_admin(db, "samuel@teste.com")
        register_user(auth_client, name="Sem respostas", email="zero@teste.com")
        register_user(auth_client, name="Precisão alta", email="preciso@teste.com")
        self._set_stats(db, "preciso@teste.com", questions_answered=10, correct_answers=9)
        # "samuel@teste.com" and "zero@teste.com" both have 0 answered.

        ascending = auth_client.get("/api/v1/admin/users?sort=accuracy").json()["items"]
        assert ascending[-1]["email"] == "preciso@teste.com"

        descending = auth_client.get("/api/v1/admin/users?sort=-accuracy").json()["items"]
        assert descending[0]["email"] == "preciso@teste.com"

    def test_unknown_sort_field_falls_back_to_default(self, auth_client: TestClient, db: Session):
        _promote_to_admin(db, "samuel@teste.com")
        register_user(auth_client, name="Outro", email="outro@teste.com")
        response = auth_client.get("/api/v1/admin/users?sort=not_a_real_field")
        assert response.status_code == 200
        assert len(response.json()["items"]) == 2


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

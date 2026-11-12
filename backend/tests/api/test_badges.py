"""Wisdom and the contributor seal, end to end: earned in play and in review."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import QuestionOption, User, UserStats
from app.models.enums import Difficulty, UserRole
from tests.factories import make_category, make_mc_question
from tests.helpers import register_and_login


def _stats(db: Session, client: TestClient) -> UserStats:
    me = client.get("/api/v1/users/me").json()
    stats = db.get(UserStats, me["id"])
    assert stats is not None
    db.refresh(stats)
    return stats


def _play(client: TestClient, db: Session, *, correct: bool, count: int = 1) -> None:
    """Plays one quiz to the end, answering everything right or everything wrong."""
    quiz = client.post("/api/v1/quizzes", json={"question_count": count})
    assert quiz.status_code == 201, quiz.text
    body = quiz.json()
    for question in body["questions"]:
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
        answered = client.post(
            f"/api/v1/quizzes/{body['id']}/answers",
            json={"question_id": question["id"], "selected_option_id": chosen},
        )
        assert answered.status_code == 200, answered.text
    assert client.post(f"/api/v1/quizzes/{body['id']}/complete").status_code == 200


def _promote(db: Session, email: str = "samuel@teste.com") -> None:
    user = db.scalars(select(User).where(User.email == email)).one()
    user.role = UserRole.ADMIN
    db.flush()


class TestWisdom:
    def test_a_hard_question_answered_right_pays_once(
        self, auth_client: TestClient, db: Session
    ) -> None:
        make_mc_question(db, make_category(db), difficulty=Difficulty.HARD)
        _play(auth_client, db, correct=True)
        assert _stats(db, auth_client).wisdom_points == 3
        # The same question again teaches nothing new.
        _play(auth_client, db, correct=True)
        assert _stats(db, auth_client).wisdom_points == 3

    def test_points_follow_the_difficulty(self, auth_client: TestClient, db: Session) -> None:
        category = make_category(db)
        for difficulty in (Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.EXPERT):
            make_mc_question(db, category, difficulty=difficulty)
        _play(auth_client, db, correct=True, count=4)
        assert _stats(db, auth_client).wisdom_points == 0 + 1 + 3 + 5

    def test_a_miss_pays_nothing_but_a_later_hit_does(
        self, auth_client: TestClient, db: Session
    ) -> None:
        make_mc_question(db, make_category(db), difficulty=Difficulty.EXPERT)
        _play(auth_client, db, correct=False)
        assert _stats(db, auth_client).wisdom_points == 0
        _play(auth_client, db, correct=True)
        assert _stats(db, auth_client).wisdom_points == 5

    def test_dashboard_and_profile_show_the_level(
        self, auth_client: TestClient, db: Session
    ) -> None:
        stats = _stats(db, auth_client)
        stats.wisdom_points = 120
        db.flush()

        wisdom = auth_client.get("/api/v1/dashboard").json()["stats"]["wisdom"]
        assert wisdom == {
            "level": 4,
            "max_level": 10,
            "points": 120,
            "level_floor": 100,
            "next_level_at": 200,
        }
        profile = auth_client.get(f"/api/v1/players/{stats.user_id}").json()
        assert profile["user"]["wisdom_level"] == 4
        # Others see the level only, never the points.
        assert "wisdom_points" not in profile["user"]
        assert "points" not in profile["user"]

    def test_the_ranking_carries_the_three_seals(
        self, auth_client: TestClient, db: Session
    ) -> None:
        stats = _stats(db, auth_client)
        stats.wisdom_points = 15
        stats.contributions = 5
        db.flush()
        me = auth_client.get("/api/v1/ranking/global").json()["me"]["user"]
        assert me["wisdom_level"] == 2
        assert me["contributor_tier"] == "silver"
        assert me["is_supporter"] is False


class TestContributor:
    def test_a_resolved_report_credits_the_reporter(
        self, auth_client: TestClient, db: Session
    ) -> None:
        question = make_mc_question(db, make_category(db))
        auth_client.post(
            "/api/v1/flags", json={"question_id": str(question.id), "reason": "wrong_text"}
        )
        assert _stats(db, auth_client).contributions == 0
        _promote(db)
        flag_id = auth_client.get("/api/v1/admin/review").json()["flags"][0]["id"]
        assert auth_client.post(f"/api/v1/admin/review/flags/{flag_id}/resolve").status_code == 204
        assert _stats(db, auth_client).contributions == 1

        dashboard = auth_client.get("/api/v1/dashboard").json()["stats"]["contributor"]
        assert dashboard == {
            "tier": "bronze",
            "contributions": 1,
            "next_tier": "silver",
            "next_tier_at": 5,
        }

    def test_a_dismissed_report_credits_nothing(self, auth_client: TestClient, db: Session) -> None:
        question = make_mc_question(db, make_category(db))
        auth_client.post(
            "/api/v1/flags", json={"question_id": str(question.id), "reason": "wrong_text"}
        )
        _promote(db)
        flag_id = auth_client.get("/api/v1/admin/review").json()["flags"][0]["id"]
        assert auth_client.post(f"/api/v1/admin/review/flags/{flag_id}/dismiss").status_code == 204
        assert _stats(db, auth_client).contributions == 0

    def test_retiring_a_reported_question_also_counts(
        self, auth_client: TestClient, db: Session
    ) -> None:
        question = make_mc_question(db, make_category(db))
        auth_client.post(
            "/api/v1/flags", json={"question_id": str(question.id), "reason": "wrong_answer"}
        )
        _promote(db)
        flag_id = auth_client.get("/api/v1/admin/review").json()["flags"][0]["id"]
        auth_client.post(f"/api/v1/admin/review/flags/{flag_id}/deactivate")
        assert _stats(db, auth_client).contributions == 1

    def test_an_approved_question_credits_the_author(
        self, auth_client: TestClient, db: Session
    ) -> None:
        category = make_category(db)
        draft = {
            "category_id": category.id,
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
        created = auth_client.post("/api/v1/proposals", json=draft)
        assert created.status_code == 201, created.text
        _promote(db)
        proposal_id = auth_client.get("/api/v1/admin/review").json()["proposals"][0]["id"]
        approved = auth_client.post(
            f"/api/v1/admin/review/proposals/{proposal_id}/approve", json=draft
        )
        assert approved.status_code == 200, approved.text
        assert _stats(db, auth_client).contributions == 1

    def test_only_an_accepted_suggestion_counts(self, auth_client: TestClient, db: Session) -> None:
        for body in (
            "Quero um modo escuro para estudar à noite.",
            "O botão de sair some no celular.",
        ):
            created = auth_client.post(
                "/api/v1/suggestions", json={"kind": "feature", "body": body}
            )
            assert created.status_code == 201, created.text
        _promote(db)
        first, second = auth_client.get("/api/v1/admin/review").json()["suggestions"]

        read = auth_client.post(f"/api/v1/admin/review/suggestions/{first['id']}/review")
        assert read.status_code == 204
        assert _stats(db, auth_client).contributions == 0

        accepted = auth_client.post(f"/api/v1/admin/review/suggestions/{second['id']}/accept")
        assert accepted.status_code == 204
        assert _stats(db, auth_client).contributions == 1
        assert auth_client.get("/api/v1/admin/review").json()["open_suggestions"] == 0
        # Already handled: a second click must not credit twice.
        again = auth_client.post(f"/api/v1/admin/review/suggestions/{second['id']}/accept")
        assert again.status_code == 400
        assert _stats(db, auth_client).contributions == 1

    def test_profile_shows_tier_and_count(self, auth_client: TestClient, db: Session) -> None:
        stats = _stats(db, auth_client)
        stats.contributions = 16
        db.flush()
        profile = auth_client.get(f"/api/v1/players/{stats.user_id}").json()
        assert profile["user"]["contributor_tier"] == "gold"
        assert profile["contributions"] == 16

    def test_other_players_see_the_seals_too(self, client: TestClient, db: Session) -> None:
        maria = register_and_login(client, name="Maria", email="maria@teste.com")
        stats = db.get(UserStats, maria["user"]["id"])
        assert stats is not None
        stats.contributions = 1
        stats.wisdom_points = 2000
        db.flush()
        me = register_and_login(client, email="samuel@teste.com")
        headers = {"Authorization": f"Bearer {me['access_token']}"}
        profile = client.get(f"/api/v1/players/{maria['user']['id']}", headers=headers).json()
        assert profile["user"]["wisdom_level"] == 10
        assert profile["user"]["contributor_tier"] == "bronze"

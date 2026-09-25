"""Public player profile, opened from the ranking and the friends list."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement, QuizAnswer, QuizSession, User, UserAchievement, UserStats
from app.models.enums import QuizMode
from app.seeds.achievements import seed_achievements
from tests.factories import make_category, make_mc_question
from tests.helpers import register_and_login

OTHER_EMAIL = "maria.privada@teste.com"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _other(client: TestClient, email: str = OTHER_EMAIL) -> dict[str, Any]:
    return register_and_login(client, name="Maria", email=email)


def _profile(client: TestClient, user_id: str, headers: dict[str, str] | None = None):
    return client.get(f"/api/v1/players/{user_id}", headers=headers or {})


def _keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in _keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in _keys(v)}
    return set()


def _answer(db: Session, user_id: uuid.UUID, questions, correct: int) -> None:
    session = QuizSession(user_id=user_id, mode=QuizMode.PRACTICE, question_count=len(questions))
    db.add(session)
    db.flush()
    for index, question in enumerate(questions):
        db.add(
            QuizAnswer(session_id=session.id, question_id=question.id, is_correct=index < correct)
        )
    db.flush()


class TestPrivacy:
    def test_never_exposes_personal_data(self, auth_client: TestClient, db: Session):
        other = _other(auth_client)
        response = _profile(auth_client, other["user"]["id"])

        assert OTHER_EMAIL not in response.text
        assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", response.text)
        forbidden = {
            "email",
            "email_verified_at",
            "hashed_password",
            "timezone",
            "daily_goal_xp",
            "created_at",
            "last_activity_date",
            "unlocked_at",
            "role",
            "is_active",
            # How much XP is left for the next level is the player's own business.
            "xp_into_level",
            "xp_for_next_level",
        }
        assert _keys(response.json()) & forbidden == set()

    def test_signup_date_only_to_the_month(self, auth_client: TestClient, db: Session):
        other = _other(auth_client)
        since = _profile(auth_client, other["user"]["id"]).json()["member_since"]
        assert re.fullmatch(r"\d{4}-\d{2}", since)


class TestAccess:
    def test_any_signed_in_player_can_view_a_stranger(self, auth_client: TestClient, db: Session):
        # Opened from the global ranking, where strangers already appear.
        other = _other(auth_client)
        response = _profile(auth_client, other["user"]["id"])
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["user"]["username"] == other["user"]["username"]
        assert body["user"]["name"] == "Maria"
        assert body["relation"] == "none"

    def test_requires_auth(self, client: TestClient, db: Session):
        other = _other(client)
        assert client.get(f"/api/v1/players/{other['user']['id']}").status_code == 401

    def test_unknown_player_is_404(self, auth_client: TestClient):
        assert _profile(auth_client, str(uuid.uuid4())).status_code == 404

    def test_deactivated_player_is_hidden_like_on_the_ranking(
        self, auth_client: TestClient, db: Session
    ):
        other = _other(auth_client)
        db.scalar(select(User).where(User.email == OTHER_EMAIL)).is_active = False
        db.flush()
        assert _profile(auth_client, other["user"]["id"]).status_code == 404


class TestRelation:
    def test_self(self, auth_client: TestClient):
        me = auth_client.get("/api/v1/users/me").json()
        assert _profile(auth_client, me["id"]).json()["relation"] == "self"

    def test_pending_both_ways_then_friends(self, auth_client: TestClient, client: TestClient):
        other = _other(client)
        auth_client.post("/api/v1/friends/requests", json={"username": other["user"]["username"]})

        assert _profile(auth_client, other["user"]["id"]).json()["relation"] == "pending_sent"
        me_id = auth_client.get("/api/v1/users/me").json()["id"]
        theirs = _profile(client, me_id, _auth(other["access_token"])).json()
        assert theirs["relation"] == "pending_received"

        incoming = client.get("/api/v1/friends", headers=_auth(other["access_token"])).json()
        client.post(
            f"/api/v1/friends/requests/{incoming['incoming'][0]['id']}/accept",
            headers=_auth(other["access_token"]),
        )
        assert _profile(auth_client, other["user"]["id"]).json()["relation"] == "friends"


class TestStats:
    def test_reports_level_streak_accuracy_and_duels(self, auth_client: TestClient, db: Session):
        other = _other(auth_client)
        user = db.scalar(select(User).where(User.email == OTHER_EMAIL))
        stats = db.get(UserStats, user.id)
        stats.total_xp = 400  # levels 1->2 (100) + 2->3 (150) = 250; 150 into level 3 of 200
        stats.level = 3
        stats.current_streak = 5
        stats.longest_streak = 12
        stats.questions_answered = 40
        stats.correct_answers = 30
        stats.perfect_sessions = 2
        stats.duel_wins, stats.duel_losses, stats.duel_draws = 4, 1, 2
        db.flush()

        body = _profile(auth_client, other["user"]["id"]).json()
        assert body["user"]["level"] == 3
        assert (
            body["user"]["duel_wins"],
            body["user"]["duel_losses"],
            body["user"]["duel_draws"],
        ) == (
            4,
            1,
            2,
        )
        s = body["stats"]
        assert s["total_xp"] == 400
        assert (s["current_streak"], s["longest_streak"]) == (5, 12)
        assert s["questions_answered"] == 40
        assert s["accuracy"] == 0.75
        assert s["perfect_sessions"] == 2

    def test_a_new_player_has_no_accuracy_yet(self, auth_client: TestClient):
        other = _other(auth_client)
        assert _profile(auth_client, other["user"]["id"]).json()["stats"]["accuracy"] is None


class TestAchievements:
    def test_counts_and_most_recent_first(self, auth_client: TestClient, db: Session):
        seed_achievements(db)
        other = _other(auth_client)
        user_id = uuid.UUID(other["user"]["id"])
        catalog = db.scalars(select(Achievement).order_by(Achievement.id)).all()
        now = datetime.now(UTC)
        for offset, achievement in enumerate(catalog[:6]):
            db.add(
                UserAchievement(
                    user_id=user_id,
                    achievement_id=achievement.id,
                    unlocked_at=now - timedelta(days=offset),
                )
            )
        db.flush()

        body = _profile(auth_client, other["user"]["id"]).json()
        assert body["achievements_unlocked"] == 6
        assert body["achievements_total"] == len(catalog)
        assert [a["code"] for a in body["recent_achievements"]] == [a.code for a in catalog[:4]]


class TestStrongestCategories:
    def test_best_accuracy_first_and_ignores_barely_played(
        self, auth_client: TestClient, db: Session
    ):
        other = _other(auth_client)
        user_id = uuid.UUID(other["user"]["id"])
        profetas, reis, cartas = (
            make_category(db, "profetas"),
            make_category(db, "reis"),
            make_category(db, "cartas"),
        )
        _answer(db, user_id, [make_mc_question(db, profetas) for _ in range(5)], correct=5)
        _answer(db, user_id, [make_mc_question(db, reis) for _ in range(10)], correct=6)
        # Two out of two is 100% but says nothing yet.
        _answer(db, user_id, [make_mc_question(db, cartas) for _ in range(2)], correct=2)

        strongest = _profile(auth_client, other["user"]["id"]).json()["strongest_categories"]
        assert [c["slug"] for c in strongest] == ["profetas", "reis"]
        assert strongest[0]["accuracy"] == 1.0
        assert strongest[1] == {
            "slug": "reis",
            "name": "Reis",
            "icon": "👤",
            "accuracy": 0.6,
            "answered": 10,
        }

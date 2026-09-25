"""The review screen's counters must describe exactly the deck a review session
draws from, under the player's current settings — otherwise "para hoje" promises
questions that "Revisar" never delivers."""

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Question, ReviewItem
from tests.factories import make_category, make_mc_question
from tests.helpers import register_and_login


def _today() -> date:
    # The SRS queue filters on "today" in the player's timezone, not the server's.
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def _my_id(client: TestClient) -> uuid.UUID:
    return uuid.UUID(client.get("/api/v1/users/me").json()["id"])


def _track(
    db: Session,
    user_id: uuid.UUID,
    question: Question,
    *,
    due: date,
    interval: int = 1,
    lapses: int = 0,
) -> ReviewItem:
    item = ReviewItem(
        user_id=user_id,
        question_id=question.id,
        repetitions=0 if lapses else 1,
        ease_factor=2.5,
        interval_days=interval,
        due_date=due,
        lapses=lapses,
    )
    db.add(item)
    db.flush()
    return item


def _summary(client: TestClient) -> dict:
    response = client.get("/api/v1/reviews/summary")
    assert response.status_code == 200, response.text
    return response.json()


def _served(client: TestClient) -> list[str] | None:
    """Question ids a review session actually draws, or None if none can start."""
    response = client.post("/api/v1/quizzes", json={"mode": "review", "question_count": 20})
    if response.status_code == 400:
        return None
    assert response.status_code == 201, response.text
    return sorted(q["id"] for q in response.json()["questions"])


class TestDeactivatedQuestions:
    def test_are_neither_counted_nor_served(self, auth_client: TestClient, db: Session):
        me = _my_id(auth_client)
        category = make_category(db)
        kept, retired = make_mc_question(db, category), make_mc_question(db, category)
        _track(db, me, kept, due=_today())
        _track(db, me, retired, due=_today())
        retired.is_active = False
        db.flush()

        summary = _summary(auth_client)
        assert summary["due_today"] == 1
        assert summary["total_items"] == 1
        assert _served(auth_client) == [str(kept.id)]

    def test_a_deck_of_only_retired_questions_shows_nothing_due(
        self, auth_client: TestClient, db: Session
    ):
        # Before: the counter said 1, the page offered "Revisar 1 pergunta", and
        # starting it failed with "Você não tem revisões pendentes hoje".
        me = _my_id(auth_client)
        retired = make_mc_question(db, make_category(db))
        _track(db, me, retired, due=_today() - timedelta(days=10))
        retired.is_active = False
        db.flush()

        assert _summary(auth_client)["due_today"] == 0
        assert _served(auth_client) is None


class TestMistakesOnlyScope:
    def test_counts_and_serves_only_missed_questions(self, auth_client: TestClient, db: Session):
        me = _my_id(auth_client)
        category = make_category(db)
        got_right, got_wrong = make_mc_question(db, category), make_mc_question(db, category)
        _track(db, me, got_right, due=_today())
        _track(db, me, got_wrong, due=_today(), lapses=2)

        assert _summary(auth_client)["due_today"] == 2

        assert auth_client.patch("/api/v1/users/me", json={"review_scope": "mistakes"}).is_success
        summary = _summary(auth_client)
        assert summary["due_today"] == 1
        assert summary["total_items"] == 1
        assert _served(auth_client) == [str(got_wrong.id)]

    def test_switching_back_restores_the_other_questions(
        self, auth_client: TestClient, db: Session
    ):
        me = _my_id(auth_client)
        category = make_category(db)
        _track(db, me, make_mc_question(db, category), due=_today())
        _track(db, me, make_mc_question(db, category), due=_today(), lapses=1)

        auth_client.patch("/api/v1/users/me", json={"review_scope": "mistakes"})
        assert _summary(auth_client)["total_items"] == 1
        auth_client.patch("/api/v1/users/me", json={"review_scope": "all"})
        assert _summary(auth_client)["total_items"] == 2


class TestMaxInterval:
    def test_pulls_in_questions_scheduled_beyond_the_cap(
        self, auth_client: TestClient, db: Session
    ):
        # Reviewed 50 days ago with a 200-day interval: not due for another 150 days.
        me = _my_id(auth_client)
        question = make_mc_question(db, make_category(db))
        item = _track(db, me, question, due=_today() + timedelta(days=150), interval=200)

        summary = _summary(auth_client)
        assert (summary["due_today"], summary["due_this_week"]) == (0, 0)
        assert _served(auth_client) is None

        # "Nothing waits more than 30 days" — so it came due 20 days ago.
        assert auth_client.patch(
            "/api/v1/users/me", json={"review_max_interval_days": 30}
        ).is_success
        summary = _summary(auth_client)
        assert (summary["due_today"], summary["due_this_week"]) == (1, 1)
        assert _served(auth_client) == [str(question.id)]

        # The stored schedule was never rewritten: lifting the cap restores it.
        db.refresh(item)
        assert item.due_date == _today() + timedelta(days=150)
        auth_client.patch("/api/v1/users/me", json={"review_max_interval_days": None})
        assert _summary(auth_client)["due_today"] == 0

    def test_leaves_questions_already_inside_the_cap_alone(
        self, auth_client: TestClient, db: Session
    ):
        me = _my_id(auth_client)
        _track(
            db,
            me,
            make_mc_question(db, make_category(db)),
            due=_today() + timedelta(days=5),
            interval=10,
        )
        auth_client.patch("/api/v1/users/me", json={"review_max_interval_days": 30})
        summary = _summary(auth_client)
        assert (summary["due_today"], summary["due_this_week"]) == (0, 1)


class TestThisWeek:
    def test_is_today_plus_the_next_six_days(self, auth_client: TestClient, db: Session):
        me = _my_id(auth_client)
        category = make_category(db)
        _track(db, me, make_mc_question(db, category), due=_today() - timedelta(days=3))
        _track(db, me, make_mc_question(db, category), due=_today() + timedelta(days=6))
        _track(db, me, make_mc_question(db, category), due=_today() + timedelta(days=7))

        summary = _summary(auth_client)
        assert summary["due_today"] == 1  # the overdue one
        assert summary["due_this_week"] == 2  # overdue + day 6; day 7 is next week
        assert summary["total_items"] == 3


class TestDashboardBadge:
    def test_counts_what_the_review_page_counts(self, auth_client: TestClient, db: Session):
        me = _my_id(auth_client)
        category = make_category(db)
        retired = make_mc_question(db, category)
        _track(db, me, retired, due=_today())
        _track(db, me, make_mc_question(db, category), due=_today())
        _track(db, me, make_mc_question(db, category), due=_today(), lapses=1)
        retired.is_active = False
        db.flush()
        auth_client.patch("/api/v1/users/me", json={"review_scope": "mistakes"})

        dashboard = auth_client.get("/api/v1/dashboard").json()
        assert dashboard["reviews_due"] == _summary(auth_client)["due_today"] == 1


class TestSpacingPreview:
    def test_summary_explains_each_spacing_with_the_players_cap(
        self, auth_client: TestClient, db: Session
    ):
        preview = _summary(auth_client)["spacing_preview"]
        assert set(preview) == {"intensive", "balanced", "relaxed"}
        assert preview["balanced"] == [1, 3, 8, 21, 57]

        auth_client.patch("/api/v1/users/me", json={"review_max_interval_days": 30})
        assert _summary(auth_client)["spacing_preview"]["balanced"] == [1, 3, 8, 21, 30]


def test_another_players_deck_never_leaks_in(auth_client: TestClient, db: Session):
    # Guard for the shared deck filter: it must keep scoping by user.
    other = register_and_login(auth_client, name="Outro", email="outro@teste.com")
    other_id = uuid.UUID(other["user"]["id"])
    _track(db, other_id, make_mc_question(db, make_category(db)), due=_today())

    theirs = auth_client.get(
        "/api/v1/reviews/summary",
        headers={"Authorization": f"Bearer {other['access_token']}"},
    ).json()
    assert theirs["due_today"] == 1
    assert db.scalar(select(ReviewItem.user_id)) == other_id
    assert _summary(auth_client)["total_items"] == 0

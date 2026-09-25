"""Admin activity panel: totals, comparison window and chart series for a date range."""

import itertools
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    AppSuggestion,
    DailyActivity,
    Duel,
    Friendship,
    Question,
    QuestionFlag,
    QuestionProposal,
    QuizAnswer,
    QuizSession,
    User,
    UserAchievement,
)
from app.models.enums import (
    AppSuggestionKind,
    DuelMode,
    DuelStatus,
    FriendshipStatus,
    QuestionFlagReason,
    QuizMode,
    UserRole,
)
from app.services.admin_stats import app_today, granularity_for
from tests.factories import make_category, make_mc_question

BRT = ZoneInfo("America/Sao_Paulo")
_ids = itertools.count(1)


def _as_admin(db: Session) -> None:
    admin = db.scalars(select(User).where(User.email == "samuel@teste.com")).one()
    admin.role = UserRole.ADMIN
    db.flush()


def _at(day: date, hour: int = 12, minute: int = 0) -> datetime:
    """A moment on a Brasília calendar day."""
    return datetime.combine(day, time(hour, minute), tzinfo=BRT)


def _player(db: Session, joined: date | datetime) -> User:
    n = next(_ids)
    user = User(
        email=f"jogador{n}@teste.com",
        username=f"jogador{n}",
        name=f"Jogador {n}",
        hashed_password="x",
        created_at=joined if isinstance(joined, datetime) else _at(joined),
    )
    db.add(user)
    db.flush()
    return user


def _played(
    db: Session,
    user: User,
    day: date,
    *,
    questions: int = 0,
    correct: int = 0,
    xp: int = 0,
    seconds: int = 0,
) -> None:
    db.add(
        DailyActivity(
            user_id=user.id,
            date=day,
            questions=questions,
            correct=correct,
            xp=xp,
            time_seconds=seconds,
        )
    )
    db.flush()


def _session(
    db: Session,
    user: User,
    mode: QuizMode,
    *,
    correct: int = 0,
    completed_at: datetime | None = None,
    abandoned_at: datetime | None = None,
) -> QuizSession:
    session = QuizSession(
        user_id=user.id,
        mode=mode,
        question_count=10,
        correct_count=correct,
        completed_at=completed_at,
        abandoned_at=abandoned_at,
    )
    db.add(session)
    db.flush()
    return session


def _duel(
    db: Session,
    challenger: User,
    *,
    created_at: datetime,
    status: DuelStatus,
    resolved_at: datetime | None = None,
) -> None:
    # The challenger's round is left unfinished so it doesn't count as a session.
    round_ = _session(db, challenger, QuizMode.DUEL)
    db.add(
        Duel(
            mode=DuelMode.RANDOM,
            status=status,
            challenger_id=challenger.id,
            challenger_session_id=round_.id,
            created_at=created_at,
            expires_at=created_at + timedelta(days=1),
            resolved_at=resolved_at,
        )
    )
    db.flush()


def _answer(db: Session, user: User, question: Question, *, correct: bool, at: datetime) -> None:
    session = _session(db, user, QuizMode.PRACTICE)
    db.add(
        QuizAnswer(
            session_id=session.id, question_id=question.id, is_correct=correct, answered_at=at
        )
    )
    db.flush()


def _activity(client: TestClient, **params: date) -> dict[str, Any]:
    response = client.get(
        "/api/v1/admin/activity", params={k: v.isoformat() for k, v in params.items()}
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


class TestAccess:
    def test_admins_only(self, auth_client: TestClient, db: Session):
        assert auth_client.get("/api/v1/admin/activity").status_code == 403
        _as_admin(db)
        assert auth_client.get("/api/v1/admin/activity").status_code == 200

    def test_requires_login(self, client: TestClient, db: Session):
        assert client.get("/api/v1/admin/activity").status_code == 401


class TestTotals:
    def test_player_numbers_only_count_days_inside_the_range(
        self, auth_client: TestClient, db: Session
    ):
        _as_admin(db)
        today = app_today()
        start, end = today - timedelta(days=20), today - timedelta(days=11)
        ana = _player(db, start - timedelta(days=10))
        bia = _player(db, start)
        caio = _player(db, end)
        _player(db, end + timedelta(days=1))

        _played(db, ana, start + timedelta(days=5), questions=10, correct=8, xp=100, seconds=300)
        _played(db, ana, end, questions=5, correct=5, xp=50, seconds=120)
        _played(db, bia, start, questions=4, correct=2, xp=30, seconds=60)
        # Only a duel stake landed that day: the XP counts, but Caio didn't play.
        _played(db, caio, end, xp=20)
        _played(db, ana, end + timedelta(days=1), questions=7, correct=7, xp=70, seconds=90)
        _played(db, bia, start - timedelta(days=1), questions=3, correct=3, xp=30, seconds=50)

        totals = _activity(auth_client, start=start, end=end)["totals"]

        assert totals["active_users"] == 2
        assert totals["new_users"] == 2
        assert totals["questions_answered"] == 19
        assert totals["correct_answers"] == 15
        assert totals["accuracy"] == round(15 / 19, 4)
        assert totals["xp"] == 200
        assert totals["study_seconds"] == 480

    def test_counts_sessions_duels_and_community_events(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        today = app_today()
        start, end = today - timedelta(days=20), today - timedelta(days=11)
        before, inside, after = (
            _at(start - timedelta(days=3)),
            _at(start + timedelta(days=3)),
            _at(end + timedelta(days=3)),
        )
        ana, bia, caio = _player(db, before), _player(db, before), _player(db, before)

        _session(db, ana, QuizMode.PRACTICE, correct=10, completed_at=inside)
        _session(db, ana, QuizMode.REVIEW, correct=3, completed_at=inside)
        _session(db, ana, QuizMode.DUEL, correct=10, completed_at=inside)
        _session(db, ana, QuizMode.PRACTICE, correct=1, abandoned_at=inside)
        _session(db, ana, QuizMode.PRACTICE, correct=10, completed_at=before)
        _session(db, ana, QuizMode.PRACTICE, correct=10, completed_at=after)

        _duel(db, ana, created_at=inside, status=DuelStatus.FINISHED, resolved_at=inside)
        _duel(db, ana, created_at=before, status=DuelStatus.FINISHED, resolved_at=inside)
        _duel(db, ana, created_at=inside, status=DuelStatus.EXPIRED, resolved_at=inside)
        _duel(db, ana, created_at=inside, status=DuelStatus.FINISHED, resolved_at=after)

        accepted, pending = FriendshipStatus.ACCEPTED, FriendshipStatus.PENDING
        db.add_all(
            [
                # Requested before the range, accepted inside it: counts.
                Friendship(
                    requester_id=ana.id,
                    addressee_id=bia.id,
                    status=accepted,
                    created_at=before,
                    responded_at=inside,
                ),
                Friendship(
                    requester_id=caio.id, addressee_id=ana.id, status=pending, created_at=inside
                ),
                Friendship(
                    requester_id=bia.id,
                    addressee_id=caio.id,
                    status=accepted,
                    created_at=inside,
                    responded_at=after,
                ),
            ]
        )
        first, second = db.scalars(select(Achievement).order_by(Achievement.id).limit(2)).all()
        db.add_all(
            [
                UserAchievement(user_id=ana.id, achievement_id=first.id, unlocked_at=inside),
                UserAchievement(user_id=ana.id, achievement_id=second.id, unlocked_at=after),
            ]
        )
        question = make_mc_question(db, make_category(db))
        db.add_all(
            [
                QuestionFlag(
                    user_id=bia.id,
                    question_id=question.id,
                    reason=QuestionFlagReason.OTHER,
                    created_at=inside,
                ),
                QuestionProposal(user_id=bia.id, payload={}, created_at=inside),
                QuestionProposal(user_id=bia.id, payload={}, created_at=before),
                AppSuggestion(
                    user_id=caio.id,
                    kind=AppSuggestionKind.FEATURE,
                    body="Modo noturno, por favor",
                    created_at=after,
                ),
            ]
        )
        db.flush()

        totals = _activity(auth_client, start=start, end=end)["totals"]

        assert totals["practice_completed"] == 1
        assert totals["review_completed"] == 1
        assert totals["duel_rounds_completed"] == 1
        assert totals["quizzes_completed"] == 3
        # Same rule as the player's stats: duel rounds count as perfect sessions too.
        assert totals["perfect_sessions"] == 2
        assert totals["quizzes_abandoned"] == 1
        assert totals["duels_started"] == 3
        assert totals["duels_finished"] == 2
        assert totals["friendships"] == 1
        assert totals["achievements_unlocked"] == 1
        assert totals["reports"] == 1
        assert totals["question_proposals"] == 1
        assert totals["suggestions"] == 0

    def test_days_are_brasilia_calendar_days(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        day = app_today() - timedelta(days=5)
        _player(db, _at(day, 0, 0))
        # Late-night signups are already the next day in UTC.
        _player(db, _at(day, 23, 30))
        _player(db, _at(day, 23, 59))
        _player(db, _at(day - timedelta(days=1), 23, 59))
        _player(db, _at(day + timedelta(days=1), 0, 0))

        body = _activity(auth_client, start=day, end=day)

        assert body["totals"]["new_users"] == 3
        assert [(p["bucket"], p["new_users"]) for p in body["series"]] == [(day.isoformat(), 3)]


class TestComparison:
    def test_compares_with_the_same_length_window_right_before(
        self, auth_client: TestClient, db: Session
    ):
        _as_admin(db)
        today = app_today()
        ana = _player(db, today - timedelta(days=15))
        bia = _player(db, today - timedelta(days=30))
        _played(db, ana, today - timedelta(days=12), questions=6, correct=3, xp=40, seconds=100)
        _played(db, bia, today - timedelta(days=10), questions=2, correct=2, xp=20, seconds=30)
        _played(db, bia, today - timedelta(days=20), questions=9, correct=9, xp=90, seconds=80)
        _played(db, ana, today, questions=1, correct=1, xp=10, seconds=5)

        body = _activity(auth_client, start=today - timedelta(days=9), end=today)

        assert body["previous"] == {
            "start": (today - timedelta(days=19)).isoformat(),
            "end": (today - timedelta(days=10)).isoformat(),
            "active_users": 2,
            "new_users": 1,
            "questions_answered": 8,
            "xp": 60,
            "study_seconds": 130,
        }


class TestSinceTheBeginning:
    def test_starts_at_the_first_data_without_a_comparison(
        self, auth_client: TestClient, db: Session
    ):
        _as_admin(db)
        today = app_today()
        first = today - timedelta(days=40)
        ana = _player(db, first)
        _played(db, ana, today - timedelta(days=30), questions=3, correct=3, xp=30, seconds=40)
        _played(db, ana, today, questions=2, correct=1, xp=10, seconds=20)

        body = _activity(auth_client)

        assert body["range"] == {
            "start": None,
            "end": today.isoformat(),
            "first_day": first.isoformat(),
            "granularity": "day",
        }
        assert body["previous"] is None
        assert len(body["series"]) == 41
        assert body["totals"]["questions_answered"] == 5
        assert body["totals"]["new_users"] == 2  # Ana and the admin

    def test_a_range_reaching_before_the_first_data_plots_from_the_first_data(
        self, auth_client: TestClient, db: Session
    ):
        _as_admin(db)
        today = app_today()
        ana = _player(db, today - timedelta(days=3))
        _played(db, ana, today - timedelta(days=3), questions=4, correct=4, xp=40, seconds=50)

        body = _activity(auth_client, start=today - timedelta(days=29))

        assert body["range"]["start"] == (today - timedelta(days=29)).isoformat()
        assert body["range"]["first_day"] == (today - timedelta(days=3)).isoformat()
        assert [p["bucket"] for p in body["series"]] == [
            (today - timedelta(days=n)).isoformat() for n in (3, 2, 1, 0)
        ]


class TestSeries:
    def test_daily_points_cover_every_day_of_the_range(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        today = app_today()
        start = today - timedelta(days=6)
        ana = _player(db, today - timedelta(days=100))
        bia = _player(db, today - timedelta(days=4))
        _played(db, ana, today - timedelta(days=4), questions=5, correct=4, xp=50, seconds=60)
        _played(db, bia, today - timedelta(days=4), questions=2, correct=2, xp=20, seconds=30)
        _played(db, ana, today, questions=1, correct=1, xp=10, seconds=10)

        body = _activity(auth_client, start=start)

        assert body["range"]["granularity"] == "day"
        series = {point["bucket"]: point for point in body["series"]}
        assert list(series) == [(start + timedelta(days=n)).isoformat() for n in range(7)]
        assert series[(today - timedelta(days=4)).isoformat()] == {
            "bucket": (today - timedelta(days=4)).isoformat(),
            "active_users": 2,
            "new_users": 1,
            "questions_answered": 7,
            "xp": 70,
            "study_seconds": 90,
        }
        assert series[(today - timedelta(days=3)).isoformat()]["active_users"] == 0
        assert series[today.isoformat()]["active_users"] == 1
        assert series[today.isoformat()]["new_users"] == 1  # the admin signed up today

    def test_weekly_points_count_each_player_once_per_week(
        self, auth_client: TestClient, db: Session
    ):
        _as_admin(db)
        today = app_today()
        start = today - timedelta(days=119)
        ana = _player(db, today - timedelta(days=500))
        bia = _player(db, today - timedelta(days=500))
        middle = today - timedelta(days=60)
        monday = middle - timedelta(days=middle.weekday())
        _played(db, ana, monday, questions=3, correct=3, xp=30, seconds=30)
        _played(db, ana, monday + timedelta(days=6), questions=2, correct=1, xp=10, seconds=20)
        _played(db, bia, monday + timedelta(days=3), questions=4, correct=4, xp=40, seconds=40)

        body = _activity(auth_client, start=start)

        assert body["range"]["granularity"] == "week"
        buckets = [date.fromisoformat(point["bucket"]) for point in body["series"]]
        assert buckets[0] == start - timedelta(days=start.weekday())
        assert buckets[-1] == today - timedelta(days=today.weekday())
        assert all(b.weekday() == 0 for b in buckets)
        assert all(
            later - earlier == timedelta(days=7) for earlier, later in itertools.pairwise(buckets)
        )
        week = next(p for p in body["series"] if p["bucket"] == monday.isoformat())
        assert (week["active_users"], week["questions_answered"], week["xp"]) == (2, 9, 80)

    def test_multi_year_ranges_are_monthly(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        today = app_today()
        start = today - timedelta(days=800)
        ana = _player(db, today - timedelta(days=900))
        month = (today - timedelta(days=400)).replace(day=1)
        _played(db, ana, month, questions=3, correct=3, xp=30, seconds=30)
        _played(db, ana, month + timedelta(days=20), questions=1, correct=0, xp=5, seconds=10)

        body = _activity(auth_client, start=start)

        assert body["range"]["granularity"] == "month"
        buckets = [date.fromisoformat(point["bucket"]) for point in body["series"]]
        assert buckets[0] == start.replace(day=1)
        assert buckets[-1] == today.replace(day=1)
        assert all(b.day == 1 for b in buckets)
        assert len(set(buckets)) == len(buckets)
        point = next(p for p in body["series"] if p["bucket"] == month.isoformat())
        assert (point["active_users"], point["questions_answered"]) == (1, 4)


def test_granularity_thresholds():
    first = date(2026, 1, 1)
    assert granularity_for(first, first) == "day"
    assert granularity_for(first, first + timedelta(days=91)) == "day"
    assert granularity_for(first, first + timedelta(days=92)) == "week"
    assert granularity_for(first, first + timedelta(days=730)) == "week"
    assert granularity_for(first, first + timedelta(days=731)) == "month"


class TestHighlights:
    def test_most_played_categories_in_the_range(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        today = app_today()
        start = today - timedelta(days=6)
        profetas, reis = make_category(db, "profetas"), make_category(db, "reis")
        ana = _player(db, today - timedelta(days=50))
        for question, correct in zip(
            [make_mc_question(db, profetas) for _ in range(3)], [True, True, False], strict=True
        ):
            _answer(db, ana, question, correct=correct, at=_at(today - timedelta(days=1)))
        _answer(db, ana, make_mc_question(db, reis), correct=True, at=_at(today))
        # Older answers would put Reis on top if the range were ignored.
        for _ in range(4):
            _answer(
                db,
                ana,
                make_mc_question(db, reis),
                correct=True,
                at=_at(start, 0, 0) - timedelta(minutes=1),
            )

        categories = _activity(auth_client, start=start)["top_categories"]

        assert [(c["slug"], c["answered"], c["accuracy"]) for c in categories] == [
            ("profetas", 3, round(2 / 3, 4)),
            ("reis", 1, 1.0),
        ]

    def test_top_players_by_xp_earned_in_the_range(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        today = app_today()
        start = today - timedelta(days=6)
        players = [_player(db, today - timedelta(days=50)) for _ in range(6)]
        for player, xp in zip(players, [20, 60, 10, 50, 40, 30], strict=True):
            _played(db, player, today, questions=xp // 10, correct=0, xp=xp)
        penalized = _player(db, today - timedelta(days=50))
        _played(db, penalized, today, questions=1, xp=-10)
        veteran = _player(db, today - timedelta(days=50))
        _played(db, veteran, start - timedelta(days=1), questions=50, xp=500)

        top = _activity(auth_client, start=start)["top_players"]

        assert [p["xp"] for p in top] == [60, 50, 40, 30, 20]
        assert top[0] == {
            "id": str(players[1].id),
            "username": players[1].username,
            "name": players[1].name,
            "xp": 60,
            "questions_answered": 6,
        }


class TestValidation:
    def test_rejects_a_start_after_the_end(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        response = auth_client.get(
            "/api/v1/admin/activity", params={"start": "2026-05-10", "end": "2026-05-01"}
        )
        assert response.status_code == 400

    def test_rejects_a_start_in_the_future(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        tomorrow = app_today() + timedelta(days=1)
        response = auth_client.get("/api/v1/admin/activity", params={"start": tomorrow.isoformat()})
        assert response.status_code == 400

    def test_a_future_end_means_today(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        today = app_today()
        _player(db, today - timedelta(days=10))

        body = _activity(
            auth_client, start=today - timedelta(days=2), end=today + timedelta(days=30)
        )

        assert body["range"]["end"] == today.isoformat()
        assert len(body["series"]) == 3

    def test_rejects_malformed_dates(self, auth_client: TestClient, db: Session):
        _as_admin(db)
        response = auth_client.get("/api/v1/admin/activity", params={"start": "25/09/2026"})
        assert response.status_code == 422

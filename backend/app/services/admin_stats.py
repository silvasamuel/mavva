"""Admin home-screen counts and the activity panel. Aggregates only — never load rows."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal, NamedTuple
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Date, DateTime, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AppSuggestion,
    Category,
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
    UserStats,
)
from app.models.enums import (
    AppSuggestionStatus,
    Difficulty,
    DuelStatus,
    FriendshipStatus,
    QuestionFlagStatus,
    QuestionProposalStatus,
    QuestionType,
    QuizMode,
    Testament,
)
from app.schemas.admin import (
    AdminActivityCategory,
    AdminActivityOut,
    AdminActivityPlayer,
    AdminActivityPoint,
    AdminActivityPrevious,
    AdminActivityRange,
    AdminActivityTotals,
    AdminDashboardActivity,
    AdminDashboardOut,
    AdminDashboardQuestions,
    AdminDashboardReview,
    AdminDashboardUsers,
)

# Product default TZ — "today" on the dashboard matches Brazil's calendar date.
_APP_TZ = ZoneInfo("America/Sao_Paulo")

Granularity = Literal["day", "week", "month"]

# Chart resolution: one point per day up to about a quarter, per week up to
# two years, per month beyond that.
DAILY_MAX_DAYS = 92
WEEKLY_MAX_DAYS = 731
TOP_CATEGORIES = 5
TOP_PLAYERS = 5


def _n(value: Any) -> int:
    return int(value or 0)


def app_today() -> date:
    return datetime.now(UTC).astimezone(_APP_TZ).date()


def dashboard(db: Session) -> AdminDashboardOut:
    now = datetime.now(UTC)
    today = now.astimezone(_APP_TZ).date()
    week_ago = now - timedelta(days=7)

    users_total, users_active, users_unverified, users_new_7d = db.execute(
        select(
            func.count(),
            func.count().filter(User.is_active.is_(True)),
            func.count().filter(User.email_verified_at.is_(None)),
            func.count().filter(User.created_at >= week_ago),
        ).select_from(User)
    ).one()

    (
        questions_total,
        questions_active,
        questions_open,
        questions_old,
        questions_easy,
        questions_medium,
        questions_hard,
        questions_expert,
    ) = db.execute(
        select(
            func.count(),
            func.count().filter(Question.is_active.is_(True)),
            func.count().filter(Question.type == QuestionType.OPEN_ANSWER),
            func.count().filter(Question.testament == Testament.OLD),
            func.count().filter(Question.difficulty == Difficulty.EASY),
            func.count().filter(Question.difficulty == Difficulty.MEDIUM),
            func.count().filter(Question.difficulty == Difficulty.HARD),
            func.count().filter(Question.difficulty == Difficulty.EXPERT),
        ).select_from(Question)
    ).one()

    flags_open = _n(
        db.scalar(select(func.count()).where(QuestionFlag.status == QuestionFlagStatus.OPEN))
    )
    proposals_pending = _n(
        db.scalar(
            select(func.count()).where(QuestionProposal.status == QuestionProposalStatus.PENDING)
        )
    )
    suggestions_open = _n(
        db.scalar(select(func.count()).where(AppSuggestion.status == AppSuggestionStatus.OPEN))
    )

    answered, correct, total_xp, longest_streak, max_level = db.execute(
        select(
            func.coalesce(func.sum(UserStats.questions_answered), 0),
            func.coalesce(func.sum(UserStats.correct_answers), 0),
            func.coalesce(func.sum(UserStats.total_xp), 0),
            func.coalesce(func.max(UserStats.longest_streak), 0),
            func.coalesce(func.max(UserStats.level), 0),
        )
    ).one()

    # A duel settling or a badge paying out also writes a DailyActivity row;
    # only rows with answers mean the player actually studied that day.
    studied_today, xp_today = db.execute(
        select(
            func.count().filter(DailyActivity.questions > 0),
            func.coalesce(func.sum(DailyActivity.xp), 0),
        ).where(DailyActivity.date == today)
    ).one()

    duels_open, duels_active, duels_finished = db.execute(
        select(
            func.count().filter(Duel.status == DuelStatus.OPEN),
            func.count().filter(Duel.status == DuelStatus.ACTIVE),
            func.count().filter(Duel.status == DuelStatus.FINISHED),
        ).select_from(Duel)
    ).one()

    answered_n = _n(answered)
    questions_total_n = _n(questions_total)
    questions_active_n = _n(questions_active)
    flags_n = _n(flags_open)
    proposals_n = _n(proposals_pending)
    suggestions_n = _n(suggestions_open)

    return AdminDashboardOut(
        users=AdminDashboardUsers(
            total=_n(users_total),
            active=_n(users_active),
            unverified=_n(users_unverified),
            new_7d=_n(users_new_7d),
        ),
        questions=AdminDashboardQuestions(
            total=questions_total_n,
            active=questions_active_n,
            inactive=questions_total_n - questions_active_n,
            open_answer=_n(questions_open),
            old_testament=_n(questions_old),
            easy=_n(questions_easy),
            medium=_n(questions_medium),
            hard=_n(questions_hard),
            expert=_n(questions_expert),
        ),
        review=AdminDashboardReview(
            flags_open=flags_n,
            proposals_pending=proposals_n,
            suggestions_open=suggestions_n,
            pending=flags_n + proposals_n + suggestions_n,
        ),
        activity=AdminDashboardActivity(
            studied_today=_n(studied_today),
            xp_today=_n(xp_today),
            questions_answered=answered_n,
            accuracy=round(_n(correct) / answered_n, 4) if answered_n else None,
            total_xp=_n(total_xp),
            longest_streak=_n(longest_streak),
            max_level=_n(max_level),
            duels_open=_n(duels_open),
            duels_active=_n(duels_active),
            duels_finished=_n(duels_finished),
        ),
    )


# --- Activity panel ---------------------------------------------------------


class _PlayerTotals(NamedTuple):
    active_users: int
    questions: int
    correct: int
    xp: int
    study_seconds: int


def _midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=_APP_TZ)


def _on_days(column: Any, start: date | None, end: date) -> ColumnElement[bool]:
    """A calendar-day column (DailyActivity.date) inside [start, end]."""
    inside: ColumnElement[bool] = column.between(start, end) if start else column <= end
    return inside


def _at_times(column: Any, start: date | None, end: date) -> ColumnElement[bool]:
    """A timestamp that falls on [start, end] as Brasília calendar days."""
    before_end = column < _midnight(end + timedelta(days=1))
    return and_(column >= _midnight(start), before_end) if start else before_end


def _local_day(column: Any) -> ColumnElement[date]:
    return cast(func.timezone(_APP_TZ.key, column), Date)


def _count(db: Session, model: type[Any], *where: ColumnElement[bool]) -> int:
    return _n(db.scalar(select(func.count()).select_from(model).where(*where)))


def granularity_for(first_day: date, end: date) -> Granularity:
    days = (end - first_day).days + 1
    if days <= DAILY_MAX_DAYS:
        return "day"
    if days <= WEEKLY_MAX_DAYS:
        return "week"
    return "month"


def _bucket_start(day: date, granularity: Granularity) -> date:
    if granularity == "week":
        return day - timedelta(days=day.weekday())  # Monday, like Postgres date_trunc
    if granularity == "month":
        return day.replace(day=1)
    return day


def _next_bucket(day: date, granularity: Granularity) -> date:
    if granularity == "day":
        return day + timedelta(days=1)
    if granularity == "week":
        return day + timedelta(days=7)
    return (day.replace(day=28) + timedelta(days=4)).replace(day=1)


def _bucket(day: Any, granularity: Granularity) -> Any:
    """SQL twin of _bucket_start, for a date expression."""
    if granularity == "day":
        return day
    return cast(func.date_trunc(granularity, cast(day, DateTime())), Date)


def _earliest_day(db: Session) -> date | None:
    first_activity = db.scalar(select(func.min(DailyActivity.date)))
    first_signup = db.scalar(select(func.min(User.created_at)))
    days = [first_activity, first_signup.astimezone(_APP_TZ).date() if first_signup else None]
    return min((day for day in days if day is not None), default=None)


def _player_totals(db: Session, start: date | None, end: date) -> _PlayerTotals:
    row = db.execute(
        select(
            func.count(DailyActivity.user_id.distinct()).filter(DailyActivity.questions > 0),
            func.coalesce(func.sum(DailyActivity.questions), 0),
            func.coalesce(func.sum(DailyActivity.correct), 0),
            func.coalesce(func.sum(DailyActivity.xp), 0),
            func.coalesce(func.sum(DailyActivity.time_seconds), 0),
        ).where(_on_days(DailyActivity.date, start, end))
    ).one()
    return _PlayerTotals(*(_n(value) for value in row))


def _series(
    db: Session, first_day: date, end: date, granularity: Granularity
) -> list[AdminActivityPoint]:
    # Bucketing happens in a subquery so GROUP BY names a plain column.
    days = (
        select(
            _bucket(DailyActivity.date, granularity).label("bucket"),
            DailyActivity.user_id,
            DailyActivity.questions,
            DailyActivity.xp,
            DailyActivity.time_seconds,
        )
        .where(_on_days(DailyActivity.date, first_day, end))
        .subquery()
    )
    played = {
        row.bucket: row
        for row in db.execute(
            select(
                days.c.bucket,
                func.count(days.c.user_id.distinct())
                .filter(days.c.questions > 0)
                .label("active_users"),
                func.sum(days.c.questions).label("questions"),
                func.sum(days.c.xp).label("xp"),
                func.sum(days.c.time_seconds).label("study_seconds"),
            ).group_by(days.c.bucket)
        )
    }
    signups = (
        select(_bucket(_local_day(User.created_at), granularity).label("bucket"))
        .where(_at_times(User.created_at, first_day, end))
        .subquery()
    )
    joined: dict[date, int] = {
        bucket: _n(count)
        for bucket, count in db.execute(
            select(signups.c.bucket, func.count()).group_by(signups.c.bucket)
        )
    }

    points: list[AdminActivityPoint] = []
    bucket = _bucket_start(first_day, granularity)
    while bucket <= end:
        row = played.get(bucket)
        points.append(
            AdminActivityPoint(
                bucket=bucket,
                active_users=_n(row.active_users) if row else 0,
                new_users=joined.get(bucket, 0),
                questions_answered=_n(row.questions) if row else 0,
                xp=_n(row.xp) if row else 0,
                study_seconds=_n(row.study_seconds) if row else 0,
            )
        )
        bucket = _next_bucket(bucket, granularity)
    return points


def _top_categories(db: Session, start: date | None, end: date) -> list[AdminActivityCategory]:
    answered = func.count(QuizAnswer.id)
    rows = db.execute(
        select(
            Category.slug,
            Category.name,
            Category.icon,
            answered,
            func.count().filter(QuizAnswer.is_correct),
        )
        .select_from(QuizAnswer)
        .join(Question, Question.id == QuizAnswer.question_id)
        .join(Category, Category.id == Question.category_id)
        .where(_at_times(QuizAnswer.answered_at, start, end))
        .group_by(Category.id)
        .order_by(answered.desc(), Category.display_order, Category.slug)
        .limit(TOP_CATEGORIES)
    ).all()
    return [
        AdminActivityCategory(
            slug=slug,
            name=name,
            icon=icon,
            answered=_n(total),
            accuracy=round(_n(right) / _n(total), 4),
        )
        for slug, name, icon, total, right in rows
    ]


def _top_players(db: Session, start: date | None, end: date) -> list[AdminActivityPlayer]:
    xp = func.sum(DailyActivity.xp)
    rows = db.execute(
        select(User.id, User.username, User.name, xp, func.sum(DailyActivity.questions))
        .join(DailyActivity, DailyActivity.user_id == User.id)
        .where(_on_days(DailyActivity.date, start, end))
        .group_by(User.id)
        .having(xp > 0)
        .order_by(xp.desc(), User.username)
        .limit(TOP_PLAYERS)
    ).all()
    return [
        AdminActivityPlayer(
            id=user_id,
            username=username,
            name=name,
            xp=_n(total_xp),
            questions_answered=_n(questions),
        )
        for user_id, username, name, total_xp, questions in rows
    ]


def activity(db: Session, start: date | None, end: date) -> AdminActivityOut:
    """What happened between start and end, inclusive (start None = since the
    beginning). The caller guarantees start <= end <= today."""
    earliest = _earliest_day(db) or end
    first_day = min(max(start or earliest, earliest), end)
    granularity = granularity_for(first_day, end)

    players = _player_totals(db, start, end)

    completed = _at_times(QuizSession.completed_at, start, end)
    abandoned = _at_times(QuizSession.abandoned_at, start, end)
    practice, review, duel_rounds, perfect, quizzes_abandoned = db.execute(
        select(
            func.count().filter(completed, QuizSession.mode == QuizMode.PRACTICE),
            func.count().filter(completed, QuizSession.mode == QuizMode.REVIEW),
            func.count().filter(completed, QuizSession.mode == QuizMode.DUEL),
            # Same rule as UserStats.perfect_sessions: all right, duel rounds included.
            func.count().filter(completed, QuizSession.correct_count == QuizSession.question_count),
            func.count().filter(abandoned),
        )
        .select_from(QuizSession)
        .where(or_(completed, abandoned))
    ).one()

    duels_started, duels_finished = db.execute(
        select(
            func.count().filter(_at_times(Duel.created_at, start, end)),
            func.count().filter(
                Duel.status == DuelStatus.FINISHED, _at_times(Duel.resolved_at, start, end)
            ),
        ).select_from(Duel)
    ).one()

    # A friendship counts on the day it was accepted, not requested.
    accepted_at = func.coalesce(Friendship.responded_at, Friendship.created_at)

    previous = None
    if start is not None:
        length = end - start + timedelta(days=1)
        prev_start, prev_end = start - length, start - timedelta(days=1)
        before = _player_totals(db, prev_start, prev_end)
        previous = AdminActivityPrevious(
            start=prev_start,
            end=prev_end,
            active_users=before.active_users,
            new_users=_count(db, User, _at_times(User.created_at, prev_start, prev_end)),
            questions_answered=before.questions,
            xp=before.xp,
            study_seconds=before.study_seconds,
        )

    return AdminActivityOut(
        range=AdminActivityRange(
            start=start, end=end, first_day=first_day, granularity=granularity
        ),
        totals=AdminActivityTotals(
            active_users=players.active_users,
            new_users=_count(db, User, _at_times(User.created_at, start, end)),
            questions_answered=players.questions,
            correct_answers=players.correct,
            accuracy=round(players.correct / players.questions, 4) if players.questions else None,
            xp=players.xp,
            study_seconds=players.study_seconds,
            quizzes_completed=_n(practice) + _n(review) + _n(duel_rounds),
            practice_completed=_n(practice),
            review_completed=_n(review),
            duel_rounds_completed=_n(duel_rounds),
            quizzes_abandoned=_n(quizzes_abandoned),
            perfect_sessions=_n(perfect),
            duels_started=_n(duels_started),
            duels_finished=_n(duels_finished),
            friendships=_count(
                db,
                Friendship,
                Friendship.status == FriendshipStatus.ACCEPTED,
                _at_times(accepted_at, start, end),
            ),
            achievements_unlocked=_count(
                db, UserAchievement, _at_times(UserAchievement.unlocked_at, start, end)
            ),
            reports=_count(db, QuestionFlag, _at_times(QuestionFlag.created_at, start, end)),
            question_proposals=_count(
                db, QuestionProposal, _at_times(QuestionProposal.created_at, start, end)
            ),
            suggestions=_count(db, AppSuggestion, _at_times(AppSuggestion.created_at, start, end)),
        ),
        previous=previous,
        series=_series(db, first_day, end, granularity),
        top_categories=_top_categories(db, start, end),
        top_players=_top_players(db, start, end),
    )

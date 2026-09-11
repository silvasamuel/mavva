"""Cheap admin home-screen counts. Aggregates only — never load rows."""

from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    DailyActivity,
    Duel,
    Friendship,
    Question,
    QuestionFlag,
    QuestionProposal,
    User,
    UserStats,
)
from app.models.enums import (
    Difficulty,
    DuelStatus,
    FriendshipStatus,
    QuestionFlagStatus,
    QuestionProposalStatus,
    QuestionType,
    Testament,
)
from app.schemas.admin import (
    AdminDashboardActivity,
    AdminDashboardOut,
    AdminDashboardQuestions,
    AdminDashboardReview,
    AdminDashboardUsers,
)

# Product default TZ — "today" on the dashboard matches Brazil's calendar date.
_APP_TZ = ZoneInfo("America/Sao_Paulo")


def _n(value: Any) -> int:
    return int(value or 0)


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

    answered, correct, total_xp, longest_streak, max_level = db.execute(
        select(
            func.coalesce(func.sum(UserStats.questions_answered), 0),
            func.coalesce(func.sum(UserStats.correct_answers), 0),
            func.coalesce(func.sum(UserStats.total_xp), 0),
            func.coalesce(func.max(UserStats.longest_streak), 0),
            func.coalesce(func.max(UserStats.level), 0),
        )
    ).one()

    studied_today, xp_today = db.execute(
        select(
            func.count(),
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

    friendships = _n(
        db.scalar(select(func.count()).where(Friendship.status == FriendshipStatus.ACCEPTED))
    )

    answered_n = _n(answered)
    questions_total_n = _n(questions_total)
    questions_active_n = _n(questions_active)
    flags_n = _n(flags_open)
    proposals_n = _n(proposals_pending)

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
            pending=flags_n + proposals_n,
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
            friendships=friendships,
        ),
    )

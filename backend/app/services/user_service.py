import math
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import verify_password
from app.models import (
    DailyActivity,
    Duel,
    Friendship,
    QuestionFlag,
    QuestionProposal,
    QuizSession,
    User,
    UserAchievement,
)


class UserServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400, retry_after: int | None = None):
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _username(others: dict[UUID, str], user_id: UUID | None) -> str | None:
    return None if user_id is None else others.get(user_id)


def _wait_label(seconds: int) -> str:
    hours = seconds // 3600
    minutes = max(1, (seconds % 3600) // 60)
    if hours:
        return f"{hours} h"
    return f"{minutes} min"


def export_account(db: Session, user: User) -> dict[str, Any]:
    cooldown = get_settings().data_export_cooldown_seconds
    now = datetime.now(UTC)
    last = user.last_data_export_at
    if last is not None:
        if last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        remaining = max(0, math.ceil(cooldown - (now - last).total_seconds()))
        if remaining > 0:
            raise UserServiceError(
                f"Você já baixou seus dados. Tente de novo em {_wait_label(remaining)}.",
                status_code=429,
                retry_after=remaining,
            )

    stats = user.stats
    sessions = db.scalars(
        select(QuizSession).where(QuizSession.user_id == user.id).order_by(QuizSession.started_at)
    ).all()
    activities = db.scalars(
        select(DailyActivity).where(DailyActivity.user_id == user.id).order_by(DailyActivity.date)
    ).all()
    achievements = db.scalars(
        select(UserAchievement).where(UserAchievement.user_id == user.id)
    ).all()
    flags = db.scalars(select(QuestionFlag).where(QuestionFlag.user_id == user.id)).all()
    proposals = db.scalars(
        select(QuestionProposal).where(QuestionProposal.user_id == user.id)
    ).all()
    friendships = db.scalars(
        select(Friendship).where(
            or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id)
        )
    ).all()
    duels = db.scalars(
        select(Duel).where(or_(Duel.challenger_id == user.id, Duel.opponent_id == user.id))
    ).all()

    friend_ids = {
        row.addressee_id if row.requester_id == user.id else row.requester_id for row in friendships
    }
    duel_ids = {row.challenger_id for row in duels} | {
        row.opponent_id for row in duels if row.opponent_id
    }
    other_ids = (friend_ids | duel_ids) - {user.id}
    others = (
        {
            other.id: other.username
            for other in db.scalars(select(User).where(User.id.in_(other_ids))).all()
        }
        if other_ids
        else {}
    )

    payload = {
        "exported_at": now.isoformat(),
        "user": {
            "id": str(user.id),
            "name": user.name,
            "username": user.username,
            "email": user.email,
            "timezone": user.timezone,
            "daily_goal_xp": user.daily_goal_xp,
            "created_at": _iso(user.created_at),
            "terms_accepted_at": _iso(user.terms_accepted_at),
            "terms_version": user.terms_version,
        },
        "stats": None
        if stats is None
        else {
            "total_xp": stats.total_xp,
            "level": stats.level,
            "current_streak": stats.current_streak,
            "longest_streak": stats.longest_streak,
            "questions_answered": stats.questions_answered,
            "correct_answers": stats.correct_answers,
            "perfect_sessions": stats.perfect_sessions,
            "total_time_seconds": stats.total_time_seconds,
            "duel_wins": stats.duel_wins,
            "duel_losses": stats.duel_losses,
            "duel_draws": stats.duel_draws,
        },
        "daily_activity": [
            {
                "date": _iso(row.date),
                "xp": row.xp,
                "questions": row.questions,
                "correct": row.correct,
                "time_seconds": row.time_seconds,
            }
            for row in activities
        ],
        "quiz_sessions": [
            {
                "id": str(row.id),
                "mode": row.mode.value,
                "question_count": row.question_count,
                "correct_count": row.correct_count,
                "xp_earned": row.xp_earned,
                "started_at": _iso(row.started_at),
                "completed_at": _iso(row.completed_at),
                "abandoned_at": _iso(row.abandoned_at),
            }
            for row in sessions
        ],
        "achievements": [
            {
                "achievement_id": row.achievement_id,
                "unlocked_at": _iso(row.unlocked_at),
            }
            for row in achievements
        ],
        "friends": [
            {
                "username": _username(
                    others,
                    row.addressee_id if row.requester_id == user.id else row.requester_id,
                ),
                "status": row.status.value,
                "created_at": _iso(row.created_at),
            }
            for row in friendships
        ],
        "duels": [
            {
                "id": str(row.id),
                "mode": row.mode.value,
                "status": row.status.value,
                "role": "challenger" if row.challenger_id == user.id else "opponent",
                "opponent_username": _username(
                    others,
                    row.opponent_id if row.challenger_id == user.id else row.challenger_id,
                ),
                "is_draw": row.is_draw,
                "created_at": _iso(row.created_at),
            }
            for row in duels
        ],
        "question_flags": [
            {
                "question_id": str(row.question_id),
                "reason": row.reason.value,
                "comment": row.comment,
                "status": row.status.value,
            }
            for row in flags
        ],
        "question_proposals": [
            {"id": str(row.id), "status": row.status.value, "payload": row.payload}
            for row in proposals
        ],
    }
    user.last_data_export_at = now
    db.commit()
    return payload


def delete_account(db: Session, user: User, password: str) -> UUID:
    if not verify_password(password, user.hashed_password):
        raise UserServiceError("Senha incorreta", status_code=403)
    user_id = user.id
    db.delete(user)
    db.commit()
    return user_id

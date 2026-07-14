"""XP, level curve, streak and daily-activity rules. Every rule here has a unit test."""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyActivity, User, UserStats
from app.models.enums import Difficulty

XP_BY_DIFFICULTY: dict[Difficulty, int] = {
    Difficulty.EASY: 10,
    Difficulty.MEDIUM: 20,
    Difficulty.HARD: 35,
    Difficulty.EXPERT: 50,
}

SESSION_COMPLETE_BONUS = 5
PERFECT_SESSION_BONUS = 10


def xp_for_answer(difficulty: Difficulty, is_correct: bool) -> int:
    """Correct pays the full difficulty value; wrong costs half of it.

    A session where errors outweigh hits can therefore end with negative XP
    (the user's lifetime total still floors at zero — see complete_session).
    """
    base = XP_BY_DIFFICULTY[difficulty]
    return base if is_correct else -(base // 2)


def xp_to_advance(level: int) -> int:
    """XP needed to go from `level` to `level + 1`: 100, 150, 200, …"""
    return 100 + (level - 1) * 50


def level_from_total_xp(total_xp: int) -> tuple[int, int, int]:
    """Returns (level, xp_into_level, xp_for_next_level)."""
    level, remaining = 1, total_xp
    while remaining >= xp_to_advance(level):
        remaining -= xp_to_advance(level)
        level += 1
    return level, remaining, xp_to_advance(level)


def today_for_user(user: User, now: datetime | None = None) -> date:
    now = now or datetime.now(UTC)
    try:
        tz = ZoneInfo(user.timezone)
    except (KeyError, ValueError):
        tz = ZoneInfo("America/Sao_Paulo")
    return now.astimezone(tz).date()


def effective_streak(stats: UserStats, today: date) -> int:
    """A streak only survives if the user studied today or yesterday."""
    if stats.last_activity_date is None:
        return 0
    if (today - stats.last_activity_date).days > 1:
        return 0
    return stats.current_streak


@dataclass
class StreakUpdate:
    current: int
    extended_today: bool


def register_streak_activity(stats: UserStats, today: date) -> StreakUpdate:
    """Called when the user completes a session; mutates stats in place."""
    if stats.last_activity_date == today:
        return StreakUpdate(current=stats.current_streak, extended_today=False)
    if stats.last_activity_date == today - timedelta(days=1):
        stats.current_streak += 1
    else:
        stats.current_streak = 1
    stats.last_activity_date = today
    stats.longest_streak = max(stats.longest_streak, stats.current_streak)
    return StreakUpdate(current=stats.current_streak, extended_today=True)


def upsert_daily_activity(
    db: Session,
    user_id: uuid.UUID,
    day: date,
    *,
    xp: int,
    questions: int,
    correct: int,
    time_seconds: int,
) -> DailyActivity:
    activity = db.scalar(
        select(DailyActivity).where(DailyActivity.user_id == user_id, DailyActivity.date == day)
    )
    if activity is None:
        # Column defaults only apply at INSERT; set them explicitly since we mutate pre-flush.
        activity = DailyActivity(
            user_id=user_id, date=day, xp=0, questions=0, correct=0, time_seconds=0
        )
        db.add(activity)
    activity.xp += xp
    activity.questions += questions
    activity.correct += correct
    activity.time_seconds += time_seconds
    return activity

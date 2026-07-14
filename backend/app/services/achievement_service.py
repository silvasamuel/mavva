import uuid
from typing import Any

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    Category,
    Question,
    QuizAnswer,
    QuizSession,
    User,
    UserAchievement,
    UserStats,
)


def _distinct_categories_answered(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count(distinct(Question.category_id)))
            .select_from(QuizAnswer)
            .join(QuizSession, QuizSession.id == QuizAnswer.session_id)
            .join(Question, Question.id == QuizAnswer.question_id)
            .where(QuizSession.user_id == user_id)
        )
        or 0
    )


def current_value(db: Session, user: User, stats: UserStats, criteria: dict[str, Any]) -> int:
    kind = criteria.get("type")
    match kind:
        case "streak":
            return stats.current_streak
        case "total_correct":
            return stats.correct_answers
        case "questions_answered":
            return stats.questions_answered
        case "perfect_sessions":
            return stats.perfect_sessions
        case "level":
            return stats.level
        case "total_xp":
            return stats.total_xp
        case "categories_covered":
            return _distinct_categories_answered(db, user.id)
        case _:
            return 0


def evaluate_achievements(db: Session, user: User, stats: UserStats) -> list[Achievement]:
    """Unlocks anything newly earned; returns the fresh unlocks."""
    unlocked_ids = set(
        db.scalars(select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id))
    )
    all_achievements = list(db.scalars(select(Achievement)))

    total_categories = db.scalar(select(func.count()).select_from(Category)) or 0
    fresh: list[Achievement] = []
    for achievement in all_achievements:
        if achievement.id in unlocked_ids:
            continue
        criteria = achievement.criteria
        target = criteria.get("value", 0)
        if criteria.get("type") == "categories_covered":
            target = total_categories
        if current_value(db, user, stats, criteria) >= target:
            db.add(UserAchievement(user_id=user.id, achievement_id=achievement.id))
            fresh.append(achievement)
    return fresh

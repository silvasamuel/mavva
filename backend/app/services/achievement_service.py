import uuid
from datetime import date
from typing import Any

from sqlalchemy import case, distinct, func, select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    Category,
    Duel,
    Question,
    QuizAnswer,
    QuizSession,
    User,
    UserAchievement,
    UserStats,
)
from app.services.gamification import level_from_total_xp, today_for_user, upsert_daily_activity


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


def _flawless_duel_wins(db: Session, user_id: uuid.UUID) -> int:
    """Duels won with a perfect round (every question right)."""
    my_session = case(
        (Duel.challenger_id == user_id, Duel.challenger_session_id),
        else_=Duel.opponent_session_id,
    )
    return (
        db.scalar(
            select(func.count())
            .select_from(Duel)
            .join(QuizSession, QuizSession.id == my_session)
            .where(
                Duel.winner_id == user_id,
                QuizSession.correct_count == QuizSession.question_count,
            )
        )
        or 0
    )


def current_value(db: Session, user: User, stats: UserStats, criteria: dict[str, Any]) -> int:
    kind = criteria.get("type")
    match kind:
        case "streak":
            return stats.current_streak
        case "duel_wins":
            return stats.duel_wins
        case "duel_streak":
            return stats.best_duel_streak
        case "duels_played":
            return stats.duel_wins + stats.duel_losses + stats.duel_draws
        case "duel_flawless_wins":
            return _flawless_duel_wins(db, user.id)
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


def _grant_unlock_xp(db: Session, user: User, stats: UserStats, xp: int, today: date) -> None:
    if xp <= 0:
        return
    stats.total_xp = max(0, stats.total_xp + xp)
    stats.level, _, _ = level_from_total_xp(stats.total_xp)
    upsert_daily_activity(db, user.id, today, xp=xp, questions=0, correct=0, time_seconds=0)


def evaluate_achievements(db: Session, user: User, stats: UserStats) -> list[Achievement]:
    """Unlocks anything newly earned, pays its XP, and returns the fresh unlocks.

    XP from a badge can itself cross a total_xp / level threshold, so we loop
    until a pass unlocks nothing new.
    """
    unlocked_ids = set(
        db.scalars(select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id))
    )
    all_achievements = list(db.scalars(select(Achievement)))

    total_categories = db.scalar(select(func.count()).select_from(Category)) or 0
    fresh: list[Achievement] = []
    today = today_for_user(user)

    pending = True
    safety = len(all_achievements) + 1
    while pending and safety > 0:
        pending = False
        safety -= 1
        for achievement in all_achievements:
            if achievement.id in unlocked_ids:
                continue
            criteria = achievement.criteria
            target = criteria.get("value", 0)
            if criteria.get("type") == "categories_covered":
                target = total_categories
            if target > 0 and current_value(db, user, stats, criteria) >= target:
                db.add(UserAchievement(user_id=user.id, achievement_id=achievement.id))
                unlocked_ids.add(achievement.id)
                fresh.append(achievement)
                _grant_unlock_xp(db, user, stats, achievement.xp_reward, today)
                pending = True
    return fresh

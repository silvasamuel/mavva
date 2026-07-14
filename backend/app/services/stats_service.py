"""Dashboard aggregation — one endpoint, one round trip for the whole home screen."""

from datetime import timedelta
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Category, DailyActivity, Question, QuizAnswer, QuizSession, User, UserStats
from app.services import srs
from app.services.gamification import effective_streak, level_from_total_xp, today_for_user
from app.services.quiz_service import recent_sessions, session_filters

WEAK_CATEGORY_MIN_ANSWERED = 10
WEAK_CATEGORY_MAX_ACCURACY = 0.80


def category_performance(db: Session, user: User) -> list[dict[str, Any]]:
    user_answers = (
        select(
            Question.category_id.label("category_id"),
            QuizAnswer.id.label("answer_id"),
            QuizAnswer.is_correct.label("is_correct"),
        )
        .join(QuizSession, QuizSession.id == QuizAnswer.session_id)
        .join(Question, Question.id == QuizAnswer.question_id)
        .where(QuizSession.user_id == user.id)
        .subquery()
    )
    rows = db.execute(
        select(
            Category.id,
            Category.slug,
            Category.name,
            Category.icon,
            Category.description,
            func.count(user_answers.c.answer_id),
            func.sum(case((user_answers.c.is_correct, 1), else_=0)),
        )
        .select_from(Category)
        .outerjoin(user_answers, user_answers.c.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.display_order)
    ).all()
    return [
        {
            "id": row[0],
            "slug": row[1],
            "name": row[2],
            "icon": row[3],
            "description": row[4],
            "answered": int(row[5] or 0),
            "accuracy": (int(row[6] or 0) / int(row[5])) if row[5] else None,
        }
        for row in rows
    ]


def _recommendations(
    db: Session, user: User, categories: list[dict[str, Any]], reviews_due: int
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []
    if reviews_due > 0:
        plural = "revisões" if reviews_due > 1 else "revisão"
        recommendations.append(
            {
                "type": "review",
                "category_slug": None,
                "reason": f"{reviews_due} {plural} vencendo hoje",
            }
        )

    practiced = [
        c
        for c in categories
        if c["answered"] >= WEAK_CATEGORY_MIN_ANSWERED and c["accuracy"] is not None
    ]
    if practiced:
        weakest = min(practiced, key=lambda c: c["accuracy"])
        if weakest["accuracy"] < WEAK_CATEGORY_MAX_ACCURACY:
            recommendations.append(
                {
                    "type": "category",
                    "category_slug": weakest["slug"],
                    "reason": f"Sua menor precisão: {weakest['name']}"
                    f" ({round(weakest['accuracy'] * 100)}%)",
                }
            )

    untouched = next((c for c in categories if c["answered"] == 0), None)
    if untouched:
        recommendations.append(
            {
                "type": "category",
                "category_slug": untouched["slug"],
                "reason": f"Você ainda não explorou {untouched['name']}",
            }
        )
    return recommendations[:3]


def get_dashboard(db: Session, user: User) -> dict[str, Any]:
    stats = db.get(UserStats, user.id)
    assert stats is not None
    today = today_for_user(user)
    level, xp_into_level, xp_for_next = level_from_total_xp(stats.total_xp)

    window_start = today - timedelta(days=29)
    activities = db.scalars(
        select(DailyActivity)
        .where(DailyActivity.user_id == user.id, DailyActivity.date >= window_start)
        .order_by(DailyActivity.date)
    ).all()
    today_activity = next((a for a in activities if a.date == today), None)

    categories = category_performance(db, user)
    reviews_due = srs.review_summary(db, user.id, today)["due_today"]
    sessions = recent_sessions(db, user, limit=5)

    accuracy = (
        stats.correct_answers / stats.questions_answered if stats.questions_answered else None
    )
    return {
        "stats": {
            "total_xp": stats.total_xp,
            "level": level,
            "xp_into_level": xp_into_level,
            "xp_for_next_level": xp_for_next,
            "current_streak": effective_streak(stats, today),
            "longest_streak": stats.longest_streak,
            "questions_answered": stats.questions_answered,
            "correct_answers": stats.correct_answers,
            "accuracy": accuracy,
            "perfect_sessions": stats.perfect_sessions,
            "total_time_seconds": stats.total_time_seconds,
        },
        "daily_goal": {
            "target": user.daily_goal_xp,
            "earned_today": max(0, today_activity.xp) if today_activity else 0,
            "achieved": (today_activity.xp if today_activity else 0) >= user.daily_goal_xp,
        },
        "evolution": [
            {
                "date": a.date.isoformat(),
                "xp": a.xp,
                "questions": a.questions,
                "correct": a.correct,
            }
            for a in activities
        ],
        "categories": categories,
        "recent_sessions": [
            {
                "id": str(s.id),
                "mode": s.mode.value,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "correct_count": s.correct_count,
                "question_count": s.question_count,
                "xp_earned": s.xp_earned,
                "duration_seconds": s.duration_seconds,
                "filters": session_filters(s),
            }
            for s in sessions
        ],
        "reviews_due": reviews_due,
        "recommendations": _recommendations(db, user, categories, reviews_due),
    }

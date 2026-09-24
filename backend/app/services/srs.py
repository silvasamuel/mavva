"""Spaced repetition — simplified SM-2 with binary quality (correct / wrong)."""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Question, ReviewItem, User
from app.models.enums import ReviewOrder, ReviewScope, ReviewSpacing

EASE_START = 2.5
EASE_MIN = 1.3
EASE_MAX = 2.8
EASE_GAIN = 0.05
EASE_LOSS = 0.2
INTENSIVE_GROWTH = 1.4


@dataclass(frozen=True)
class ReviewSettings:
    spacing: ReviewSpacing = ReviewSpacing.BALANCED
    scope: ReviewScope = ReviewScope.ALL
    order: ReviewOrder = ReviewOrder.OLDEST
    session_size: int = 10
    max_interval_days: int | None = None


def settings_for(user: User) -> ReviewSettings:
    return ReviewSettings(
        spacing=user.review_spacing,
        scope=user.review_scope,
        order=user.review_order,
        session_size=user.review_session_size,
        max_interval_days=user.review_max_interval_days,
    )


def apply_review(
    item: ReviewItem,
    is_correct: bool,
    today: date,
    settings: ReviewSettings | None = None,
) -> ReviewItem:
    """Mutates the review item according to SM-2 (binary quality)."""
    settings = settings or ReviewSettings()
    if is_correct:
        item.repetitions += 1
        item.interval_days = _interval_after_hit(item, settings.spacing)
        if settings.max_interval_days is not None:
            item.interval_days = min(item.interval_days, settings.max_interval_days)
        item.ease_factor = min(EASE_MAX, item.ease_factor + EASE_GAIN)
    else:
        item.repetitions = 0
        item.interval_days = 1
        item.ease_factor = max(EASE_MIN, item.ease_factor - EASE_LOSS)
        item.lapses += 1
    item.due_date = today + timedelta(days=item.interval_days)
    return item


def _interval_after_hit(item: ReviewItem, spacing: ReviewSpacing) -> int:
    if spacing == ReviewSpacing.INTENSIVE:
        if item.repetitions == 1:
            return 1
        if item.repetitions == 2:
            return 2
        return max(1, round(item.interval_days * INTENSIVE_GROWTH))
    if spacing == ReviewSpacing.RELAXED:
        if item.repetitions == 1:
            return 3
        if item.repetitions == 2:
            return 7
        return max(1, round(item.interval_days * item.ease_factor))
    if item.repetitions == 1:
        return 1
    if item.repetitions == 2:
        return 3
    return max(1, round(item.interval_days * item.ease_factor))


def record_answer(
    db: Session,
    user_id: uuid.UUID,
    question_id: uuid.UUID,
    is_correct: bool,
    today: date,
    settings: ReviewSettings | None = None,
) -> ReviewItem | None:
    settings = settings or ReviewSettings()
    item = db.scalar(
        select(ReviewItem).where(
            ReviewItem.user_id == user_id, ReviewItem.question_id == question_id
        )
    )
    if item is None:
        if settings.scope == ReviewScope.MISTAKES and is_correct:
            return None
        # Column defaults only apply at INSERT; set them explicitly since we mutate pre-flush.
        item = ReviewItem(
            user_id=user_id,
            question_id=question_id,
            repetitions=0,
            ease_factor=EASE_START,
            interval_days=1,
            due_date=today,
            lapses=0,
        )
        db.add(item)
    return apply_review(item, is_correct, today, settings)


def due_question_ids(
    db: Session,
    user_id: uuid.UUID,
    today: date,
    limit: int,
    order: ReviewOrder = ReviewOrder.OLDEST,
) -> list[uuid.UUID]:
    """Due items only. Oldest-due first, unless the player asked for the most lapsed."""
    ordering = (
        (ReviewItem.lapses.desc(), ReviewItem.due_date)
        if order == ReviewOrder.LAPSES
        else (ReviewItem.due_date,)
    )
    rows = db.scalars(
        select(ReviewItem.question_id)
        .join(Question, Question.id == ReviewItem.question_id)
        .where(ReviewItem.user_id == user_id, ReviewItem.due_date <= today, Question.is_active)
        .order_by(*ordering)
        .limit(limit)
    )
    return list(rows)


def review_summary(db: Session, user_id: uuid.UUID, today: date) -> dict[str, int]:
    due_today = db.scalar(
        select(func.count())
        .select_from(ReviewItem)
        .where(ReviewItem.user_id == user_id, ReviewItem.due_date <= today)
    )
    due_week = db.scalar(
        select(func.count())
        .select_from(ReviewItem)
        .where(ReviewItem.user_id == user_id, ReviewItem.due_date <= today + timedelta(days=7))
    )
    total = db.scalar(
        select(func.count()).select_from(ReviewItem).where(ReviewItem.user_id == user_id)
    )
    return {"due_today": due_today or 0, "due_this_week": due_week or 0, "total_items": total or 0}

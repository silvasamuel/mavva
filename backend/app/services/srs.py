"""Spaced repetition — simplified SM-2 with binary quality (correct / wrong)."""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Question, ReviewItem

EASE_START = 2.5
EASE_MIN = 1.3
EASE_MAX = 2.8
EASE_GAIN = 0.05
EASE_LOSS = 0.2


def apply_review(item: ReviewItem, is_correct: bool, today: date) -> ReviewItem:
    """Mutates the review item according to SM-2 (binary quality)."""
    if is_correct:
        item.repetitions += 1
        if item.repetitions == 1:
            item.interval_days = 1
        elif item.repetitions == 2:
            item.interval_days = 3
        else:
            item.interval_days = max(1, round(item.interval_days * item.ease_factor))
        item.ease_factor = min(EASE_MAX, item.ease_factor + EASE_GAIN)
    else:
        item.repetitions = 0
        item.interval_days = 1
        item.ease_factor = max(EASE_MIN, item.ease_factor - EASE_LOSS)
        item.lapses += 1
    item.due_date = today + timedelta(days=item.interval_days)
    return item


def record_answer(
    db: Session, user_id: uuid.UUID, question_id: uuid.UUID, is_correct: bool, today: date
) -> ReviewItem:
    item = db.scalar(
        select(ReviewItem).where(
            ReviewItem.user_id == user_id, ReviewItem.question_id == question_id
        )
    )
    if item is None:
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
    return apply_review(item, is_correct, today)


def due_question_ids(db: Session, user_id: uuid.UUID, today: date, limit: int) -> list[uuid.UUID]:
    """Oldest-due first, so long-overdue items always surface."""
    rows = db.scalars(
        select(ReviewItem.question_id)
        .join(Question, Question.id == ReviewItem.question_id)
        .where(ReviewItem.user_id == user_id, ReviewItem.due_date <= today, Question.is_active)
        .order_by(ReviewItem.due_date)
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

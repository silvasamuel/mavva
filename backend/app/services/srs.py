"""Spaced repetition — simplified SM-2 with binary quality (correct / wrong)."""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models import Question, ReviewItem, User
from app.models.enums import ReviewOrder, ReviewScope, ReviewSpacing

EASE_START = 2.5
EASE_MIN = 1.3
EASE_MAX = 2.8
EASE_GAIN = 0.05
EASE_LOSS = 0.2
INTENSIVE_GROWTH = 1.4
# "Nesta semana" is today plus the next six days — seven calendar days.
WEEK_DAYS = 7
# How many consecutive hits the spacing preview on the review screen shows.
PREVIEW_HITS = 5


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


def _in_deck(user_id: uuid.UUID, settings: ReviewSettings) -> list[ColumnElement[bool]]:
    """Which review items are in play under the player's current settings.

    Shared by the counts and by the session draw so the two can never disagree
    again: counting an item the draw would never serve (a deactivated question)
    inflated "para hoje" forever, since an item that is never served never
    moves its due date. "Só o que eu erro" keeps only items missed at least
    once; the rest stay tracked and come back if the player switches back.
    Callers must join Question.
    """
    conditions: list[ColumnElement[bool]] = [
        ReviewItem.user_id == user_id,
        Question.is_active.is_(True),
    ]
    if settings.scope == ReviewScope.MISTAKES:
        conditions.append(ReviewItem.lapses > 0)
    return conditions


def _effective_due(settings: ReviewSettings) -> Any:
    """Due date as the current settings see it.

    A max interval chosen after an item was scheduled pulls it back in: it
    comes due at most max_interval_days after its last review (stored due date
    minus its interval). Computed at read time — the stored schedule is left
    alone, so removing the cap restores it.
    """
    if settings.max_interval_days is None:
        return ReviewItem.due_date
    last_review = ReviewItem.due_date - ReviewItem.interval_days
    return func.least(ReviewItem.due_date, last_review + settings.max_interval_days)


def due_question_ids(
    db: Session,
    user_id: uuid.UUID,
    today: date,
    limit: int,
    settings: ReviewSettings,
) -> list[uuid.UUID]:
    """Due items only. Oldest-due first, unless the player asked for the most lapsed."""
    due = _effective_due(settings)
    ordering = (ReviewItem.lapses.desc(), due) if settings.order == ReviewOrder.LAPSES else (due,)
    rows = db.scalars(
        select(ReviewItem.question_id)
        .join(Question, Question.id == ReviewItem.question_id)
        .where(*_in_deck(user_id, settings), due <= today)
        .order_by(*ordering)
        .limit(limit)
    )
    return list(rows)


def review_summary(
    db: Session, user_id: uuid.UUID, today: date, settings: ReviewSettings
) -> dict[str, int]:
    due = _effective_due(settings)
    due_today, due_week, total = db.execute(
        select(
            func.count().filter(due <= today),
            func.count().filter(due < today + timedelta(days=WEEK_DAYS)),
            func.count(),
        )
        .select_from(ReviewItem)
        .join(Question, Question.id == ReviewItem.question_id)
        .where(*_in_deck(user_id, settings))
    ).one()
    return {"due_today": due_today, "due_this_week": due_week, "total_items": total}


def spacing_preview(settings: ReviewSettings) -> dict[str, list[int]]:
    """Days until a fresh question comes back after each consecutive hit.

    Runs the real scheduler on a throwaway item for every spacing option (with
    the player's max interval applied), so the review screen explains the
    schedule without keeping its own copy of the numbers.
    """
    preview: dict[str, list[int]] = {}
    for spacing in ReviewSpacing:
        item = ReviewItem(repetitions=0, ease_factor=EASE_START, interval_days=1, lapses=0)
        as_if = ReviewSettings(spacing=spacing, max_interval_days=settings.max_interval_days)
        steps = []
        for _ in range(PREVIEW_HITS):
            apply_review(item, True, date.min, as_if)
            steps.append(item.interval_days)
        preview[spacing.value] = steps
    return preview

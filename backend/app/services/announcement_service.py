"""Announcements ("Novidades"): what players see and what counts as unread."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Announcement, User

# The screen shows the most recent ones; older news is not worth scrolling to.
FEED_LIMIT = 50


def _read_until(user: User) -> datetime:
    """Everything published up to here is read: the last visit, or signup."""
    return user.notifications_seen_at or user.created_at


def feed(db: Session, user: User) -> list[tuple[Announcement, bool]]:
    """Published announcements, newest first, each with whether it is unread."""
    rows = db.scalars(
        select(Announcement)
        .where(Announcement.published_at.is_not(None))
        .order_by(Announcement.published_at.desc())
        .limit(FEED_LIMIT)
    ).all()
    seen = _read_until(user)
    return [(row, row.published_at is not None and row.published_at > seen) for row in rows]


def unread_count(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Announcement)
            .where(Announcement.published_at > _read_until(user))
        )
        or 0
    )


def mark_seen(user: User) -> None:
    user.notifications_seen_at = datetime.now(UTC)


def set_published(announcement: Announcement, published: bool) -> None:
    """Publishing stamps the time once; editing a published one keeps it, so a typo
    fix doesn't bring it back as unread. Unpublishing turns it into a draft."""
    if published and announcement.published_at is None:
        announcement.published_at = datetime.now(UTC)
    elif not published:
        announcement.published_at = None


def get(db: Session, announcement_id: uuid.UUID) -> Announcement | None:
    return db.get(Announcement, announcement_id)

"""Another player's public profile — game stats only.

Deliberately leaves out e-mail, timezone, daily goal, activity dates and the
exact signup date: nothing that identifies or locates the person beyond the
name and handle the ranking and friend lists already show. Deactivated
accounts are hidden, like they are on the leaderboards.
"""

import uuid
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Achievement, User, UserAchievement
from app.models.enums import FriendshipStatus
from app.services import friendship_service
from app.services.stats_service import category_performance

RECENT_ACHIEVEMENTS = 4
STRONGEST_CATEGORIES = 3
# A category needs this many answers before its accuracy says anything.
MIN_CATEGORY_ANSWERS = 5

Relation = Literal["self", "none", "pending_sent", "pending_received", "friends"]


def find_player(db: Session, user_id: uuid.UUID) -> User | None:
    return db.scalar(
        select(User)
        .where(User.id == user_id, User.is_active.is_(True))
        .options(selectinload(User.stats))
    )


def relation_to(db: Session, me: User, other: User) -> Relation:
    if other.id == me.id:
        return "self"
    friendship = friendship_service.friendship_between(db, me.id, other.id)
    if friendship is None:
        return "none"
    if friendship.status == FriendshipStatus.ACCEPTED:
        return "friends"
    if friendship.status == FriendshipStatus.PENDING:
        return "pending_sent" if friendship.requester_id == me.id else "pending_received"
    return "none"


def achievements_of(db: Session, user_id: uuid.UUID) -> tuple[int, int, list[Achievement]]:
    """(unlocked, total, most recent unlocks first)."""
    unlocked = (
        db.scalar(
            select(func.count())
            .select_from(UserAchievement)
            .where(UserAchievement.user_id == user_id)
        )
        or 0
    )
    total = db.scalar(select(func.count()).select_from(Achievement)) or 0
    recent = list(
        db.scalars(
            select(Achievement)
            .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
            .where(UserAchievement.user_id == user_id)
            .order_by(UserAchievement.unlocked_at.desc(), Achievement.id)
            .limit(RECENT_ACHIEVEMENTS)
        )
    )
    return unlocked, total, recent


def strongest_categories(db: Session, user: User) -> list[dict[str, Any]]:
    practiced = [
        row for row in category_performance(db, user) if row["answered"] >= MIN_CATEGORY_ANSWERS
    ]
    practiced.sort(key=lambda row: (-row["accuracy"], -row["answered"]))
    return practiced[:STRONGEST_CATEGORIES]

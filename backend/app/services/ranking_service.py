"""XP leaderboards: global top 10, and the circle of you plus your friends."""

from dataclasses import dataclass

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import User, UserStats
from app.services import friendship_service

GLOBAL_LIMIT = 10


@dataclass(frozen=True)
class RankedPlayer:
    position: int
    user: User
    total_xp: int
    is_me: bool


@dataclass(frozen=True)
class GlobalBoard:
    top: list[RankedPlayer]
    me: RankedPlayer
    total_players: int


def _xp(user: User) -> int:
    return user.stats.total_xp if user.stats else 0


def _with_stats(db: Session, user: User) -> User:
    if user.stats is not None:
        return user
    loaded = db.scalar(select(User).where(User.id == user.id).options(selectinload(User.stats)))
    return loaded or user


def _position_of(db: Session, me: User) -> int:
    """1-based place: more XP ranks higher; equal XP breaks on username."""
    xp = _xp(me)
    ahead = db.scalar(
        select(func.count())
        .select_from(User)
        .join(UserStats, UserStats.user_id == User.id)
        .where(
            User.is_active.is_(True),
            or_(
                UserStats.total_xp > xp,
                and_(UserStats.total_xp == xp, User.username < me.username),
            ),
        )
    )
    return (ahead or 0) + 1


def global_board(db: Session, me: User) -> GlobalBoard:
    me = _with_stats(db, me)
    top_users = list(
        db.scalars(
            select(User)
            .join(UserStats, UserStats.user_id == User.id)
            .where(User.is_active.is_(True))
            .options(selectinload(User.stats))
            .order_by(UserStats.total_xp.desc(), User.username.asc())
            .limit(GLOBAL_LIMIT)
        ).all()
    )
    total = db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0
    top = [
        RankedPlayer(position=index + 1, user=user, total_xp=_xp(user), is_me=user.id == me.id)
        for index, user in enumerate(top_users)
    ]
    mine = next((row for row in top if row.is_me), None)
    if mine is None:
        mine = RankedPlayer(position=_position_of(db, me), user=me, total_xp=_xp(me), is_me=True)
    return GlobalBoard(top=top, me=mine, total_players=total)


def friends_board(db: Session, me: User) -> list[RankedPlayer]:
    me = _with_stats(db, me)
    friends = [friend for friend in friendship_service.list_friends(db, me) if friend.is_active]
    circle = [me, *friends]
    circle.sort(key=lambda user: (-_xp(user), user.username))
    return [
        RankedPlayer(position=index + 1, user=user, total_xp=_xp(user), is_me=user.id == me.id)
        for index, user in enumerate(circle)
    ]

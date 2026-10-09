"""Leaderboards: global XP top 10, the circle of you plus your friends, and
lifetime accuracy among players with enough answers."""

from dataclasses import dataclass

from sqlalchemy import BigInteger, ColumnElement, Float, and_, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import User, UserStats
from app.services import friendship_service

GLOBAL_LIMIT = 10
# Answers a player needs before entering the accuracy board: without a floor,
# someone who got 3 of 3 right (100%) would top it.
MIN_ACCURACY_ANSWERS = 50


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
    # list_friends already leaves deactivated accounts out.
    circle = [me, *friendship_service.list_friends(db, me)]
    circle.sort(key=lambda user: (-_xp(user), user.username))
    return [
        RankedPlayer(position=index + 1, user=user, total_xp=_xp(user), is_me=user.id == me.id)
        for index, user in enumerate(circle)
    ]


@dataclass(frozen=True)
class AccuracyPlayer:
    position: int
    user: User
    questions_answered: int
    correct_answers: int
    is_me: bool

    @property
    def accuracy(self) -> float:
        return self.correct_answers / self.questions_answered


@dataclass(frozen=True)
class AccuracyBoard:
    top: list[AccuracyPlayer]
    me: AccuracyPlayer | None  # None until you reach MIN_ACCURACY_ANSWERS
    my_answers: int
    total_players: int


def _qualified() -> tuple[ColumnElement[bool], ...]:
    return (
        User.is_active.is_(True),
        UserStats.questions_answered >= MIN_ACCURACY_ANSWERS,
    )


def _accuracy_position_of(db: Session, me: User, correct: int, answered: int) -> int:
    """1-based place: higher accuracy, then more answers, then username.

    Ratios are compared by cross-multiplying (a/b > c/d <=> a*d > c*b) so equal
    accuracies tie exactly; bigint because two big counts overflow an integer.
    """
    theirs = cast(UserStats.correct_answers, BigInteger) * answered
    mine = correct * cast(UserStats.questions_answered, BigInteger)
    ahead = db.scalar(
        select(func.count())
        .select_from(User)
        .join(UserStats, UserStats.user_id == User.id)
        .where(
            *_qualified(),
            or_(
                theirs > mine,
                and_(theirs == mine, UserStats.questions_answered > answered),
                and_(
                    theirs == mine,
                    UserStats.questions_answered == answered,
                    User.username < me.username,
                ),
            ),
        )
    )
    return (ahead or 0) + 1


def accuracy_board(db: Session, me: User) -> AccuracyBoard:
    me = _with_stats(db, me)
    # Dividing two exact integers in float8 is correctly rounded, so equal
    # ratios sort as ties and the order matches _accuracy_position_of.
    accuracy = UserStats.correct_answers / cast(UserStats.questions_answered, Float)
    top_users = list(
        db.scalars(
            select(User)
            .join(UserStats, UserStats.user_id == User.id)
            .where(*_qualified())
            .options(selectinload(User.stats))
            .order_by(accuracy.desc(), UserStats.questions_answered.desc(), User.username.asc())
            .limit(GLOBAL_LIMIT)
        ).all()
    )
    total = (
        db.scalar(
            select(func.count())
            .select_from(User)
            .join(UserStats, UserStats.user_id == User.id)
            .where(*_qualified())
        )
        or 0
    )
    top = [
        AccuracyPlayer(
            position=index + 1,
            user=user,
            questions_answered=user.stats.questions_answered,
            correct_answers=user.stats.correct_answers,
            is_me=user.id == me.id,
        )
        for index, user in enumerate(top_users)
    ]
    answered = me.stats.questions_answered if me.stats else 0
    correct = me.stats.correct_answers if me.stats else 0
    mine = next((row for row in top if row.is_me), None)
    if mine is None and answered >= MIN_ACCURACY_ANSWERS:
        mine = AccuracyPlayer(
            position=_accuracy_position_of(db, me, correct, answered),
            user=me,
            questions_answered=answered,
            correct_answers=correct,
            is_me=True,
        )
    return AccuracyBoard(top=top, me=mine, my_answers=answered, total_players=total)

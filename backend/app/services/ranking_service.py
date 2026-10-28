"""Leaderboards: global XP top 10, the circle of you plus your friends, and
lifetime accuracy among players who reached Espiga, optionally one elo at a time."""

from dataclasses import dataclass

from sqlalchemy import (
    BigInteger,
    ColumnElement,
    Float,
    and_,
    cast,
    func,
    literal,
    or_,
    select,
    union_all,
)
from sqlalchemy.orm import Session, selectinload

from app.models import Season, SeasonResult, User, UserStats
from app.services import friendship_service, season_service
from app.services.gamification import LEVELS_PER_RANK, RANKS, Rank, rank_from_level

GLOBAL_LIMIT = 10
# The accuracy board starts at Espiga (level 11, 3250 XP): reaching it takes
# far more than a handful of answers, so 3 out of 3 (100%) can't top the board.
ACCURACY_MIN_RANK_CODE = "espiga"
_RANK_CODES = [code for code, _ in RANKS]
ACCURACY_RANK_CODES = _RANK_CODES[_RANK_CODES.index(ACCURACY_MIN_RANK_CODE) :]


def rank_by_code(code: str) -> Rank:
    return rank_from_level(_RANK_CODES.index(code) * LEVELS_PER_RANK + 1)


ACCURACY_MIN_RANK = rank_by_code(ACCURACY_MIN_RANK_CODE)


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
    me: AccuracyPlayer | None  # None below Espiga, or outside the chosen elo
    eligible: bool  # the caller reached ACCURACY_MIN_RANK
    total_players: int  # in the chosen elo (every elo from Espiga up if none)


def _qualified(elo: Rank | None) -> tuple[ColumnElement[bool], ...]:
    band = elo or ACCURACY_MIN_RANK
    conditions: list[ColumnElement[bool]] = [
        User.is_active.is_(True),
        UserStats.questions_answered > 0,
        UserStats.level >= band.min_level,
    ]
    # No elo chosen: every elo from Espiga up, so no ceiling.
    if elo is not None and elo.max_level is not None:
        conditions.append(UserStats.level <= elo.max_level)
    return tuple(conditions)


def _in_band(level: int, elo: Rank | None) -> bool:
    band = elo or ACCURACY_MIN_RANK
    if level < band.min_level:
        return False
    return elo is None or elo.max_level is None or level <= elo.max_level


def _accuracy_position_of(
    db: Session, me: User, correct: int, answered: int, elo: Rank | None
) -> int:
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
            *_qualified(elo),
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


def accuracy_board(db: Session, me: User, elo: Rank | None = None) -> AccuracyBoard:
    """`elo` narrows the board to one band (Espiga and up); None lists all of them."""
    me = _with_stats(db, me)
    # Dividing two exact integers in float8 is correctly rounded, so equal
    # ratios sort as ties and the order matches _accuracy_position_of.
    accuracy = UserStats.correct_answers / cast(UserStats.questions_answered, Float)
    top_users = list(
        db.scalars(
            select(User)
            .join(UserStats, UserStats.user_id == User.id)
            .where(*_qualified(elo))
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
            .where(*_qualified(elo))
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
    level = me.stats.level if me.stats else 1
    mine = next((row for row in top if row.is_me), None)
    if mine is None and answered > 0 and _in_band(level, elo):
        mine = AccuracyPlayer(
            position=_accuracy_position_of(db, me, correct, answered, elo),
            user=me,
            questions_answered=answered,
            correct_answers=correct,
            is_me=True,
        )
    return AccuracyBoard(
        top=top, me=mine, eligible=level >= ACCURACY_MIN_RANK.min_level, total_players=total
    )


# --- all-time podium -----------------------------------------------------------------

PODIUM_SIZE = 3


@dataclass(frozen=True)
class PodiumEntry:
    position: int
    user: User
    score: int  # XP in the season of that record
    season: Season
    live: bool  # the record is in the season still being played
    is_me: bool


def all_time_podium(db: Session, me: User) -> list[PodiumEntry]:
    """The three best season scores ever, one per player (their best), active accounts
    only. Closed seasons come from season_results; the current one counts live."""
    current, _ = season_service.ensure_current_season(db, season_service.season_today())
    past = select(
        SeasonResult.user_id.label("user_id"),
        SeasonResult.final_xp.label("score"),
        SeasonResult.season_id.label("season_id"),
    )
    live = select(
        UserStats.user_id.label("user_id"),
        UserStats.total_xp.label("score"),
        literal(current.id).label("season_id"),
    ).where(UserStats.total_xp > 0)
    scores = union_all(past, live).subquery()
    best = (
        select(
            scores.c.user_id,
            scores.c.score,
            scores.c.season_id,
            func.row_number()
            .over(
                partition_by=scores.c.user_id, order_by=(scores.c.score.desc(), scores.c.season_id)
            )
            .label("pick"),
        )
    ).subquery()
    rows = db.execute(
        select(User, best.c.score, Season)
        .join(best, best.c.user_id == User.id)
        .join(Season, Season.id == best.c.season_id)
        .where(best.c.pick == 1, User.is_active.is_(True))
        .options(selectinload(User.stats))
        .order_by(best.c.score.desc(), User.username.asc())
        .limit(PODIUM_SIZE)
    ).all()
    return [
        PodiumEntry(
            position=index + 1,
            user=user,
            score=score,
            season=season,
            live=season.id == current.id,
            is_me=user.id == me.id,
        )
        for index, (user, score, season) in enumerate(rows)
    ]

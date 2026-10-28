"""Monthly seasons: XP, level and both leaderboards restart on the 1st.

There is no scheduler, so the rollover is lazy: the first authenticated
request after a season ends closes it (see deps.get_current_user). A
Postgres advisory lock makes sure only one request does it; the others wait
and then find the new season already open.

Closing a season archives where each player finished (SeasonResult), keeps
the best level ever reached and the level the season ended at, then zeroes
XP and level for everyone — all in set-based statements, no per-user loop.
Achievements, streaks, duel records and accuracy are lifetime and untouched.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, case, func, insert, literal, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import SQLCoreOperations

from app.models import Season, SeasonResult, User, UserStats
from app.services import achievement_service
from app.services.gamification import LEVELS_PER_RANK, RANKS, Rank, rank_from_level

# Seasons follow Brazil's calendar, like the rest of the product.
_APP_TZ = ZoneInfo("America/Sao_Paulo")
# Any constant works; it only has to be the same for every process.
_ROLLOVER_LOCK = 20_261_009

MONTHS = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)


def season_today() -> date:
    return datetime.now(UTC).astimezone(_APP_TZ).date()


def month_start(day: date) -> date:
    return day.replace(day=1)


def next_month_start(day: date) -> date:
    return date(day.year + 1, 1, 1) if day.month == 12 else date(day.year, day.month + 1, 1)


def season_name(season: Season) -> str:
    return f"{MONTHS[season.starts_on.month - 1]} de {season.starts_on.year}"


def _rank_code_sql(level: SQLCoreOperations[int]) -> ColumnElement[str]:
    """SQL twin of rank_from_level(level).code, for the archive INSERT."""
    whens = [
        (level <= (index + 1) * LEVELS_PER_RANK, code) for index, (code, _) in enumerate(RANKS[:-1])
    ]
    return case(*whens, else_=RANKS[-1][0])


def _close(db: Session, season: Season) -> None:
    active_first = func.row_number().over(
        partition_by=User.is_active,
        order_by=(UserStats.total_xp.desc(), User.username.asc()),
    )
    db.execute(
        insert(SeasonResult).from_select(
            ["season_id", "user_id", "final_xp", "final_level", "rank_code", "position"],
            select(
                literal(season.id),
                UserStats.user_id,
                UserStats.total_xp,
                UserStats.level,
                _rank_code_sql(UserStats.level),
                # Same order as the global leaderboard, which only lists active accounts.
                case((User.is_active, active_first), else_=None),
            )
            .join(User, User.id == UserStats.user_id)
            .where(UserStats.total_xp > 0),
        )
    )
    db.execute(
        update(UserStats).values(
            best_level=func.greatest(UserStats.best_level, UserStats.level),
            # Who didn't play the season has no rank to show for it.
            last_season_level=case((UserStats.total_xp > 0, UserStats.level), else_=None),
            total_xp=0,
            level=1,
        )
    )
    season.closed_at = datetime.now(UTC)


def _latest(db: Session) -> Season | None:
    return db.scalar(
        select(Season)
        .order_by(Season.number.desc())
        .limit(1)
        .execution_options(populate_existing=True)
    )


def ensure_current_season(db: Session, today: date) -> tuple[Season, bool]:
    """The season that contains `today`, opening it (and closing the last one)
    if needed. Returns (season, changed); the caller commits when changed."""
    latest = _latest(db)
    if latest is not None and latest.starts_on <= today < latest.ends_on:
        return latest, False

    db.execute(select(func.pg_advisory_xact_lock(_ROLLOVER_LOCK)))
    latest = _latest(db)  # another request may have rolled over while we waited
    if latest is not None and today < latest.ends_on:
        return latest, False
    closing = latest if latest is not None and latest.closed_at is None else None
    if closing is not None:
        _close(db, closing)
    # A month with no traffic at all gets no season of its own.
    season = Season(
        number=(latest.number + 1) if latest else 1,
        starts_on=month_start(today),
        ends_on=next_month_start(today),
    )
    db.add(season)
    db.flush()
    # The bulk UPDATE bypassed the identity map; reload anything already loaded.
    db.expire_all()
    if closing is not None:
        _award_season_achievements(db, closing)
        db.flush()
    return season, True


# The end-of-season notice opens during the season's last week.
END_NOTICE_DAYS = 7

SeasonNotice = Literal["start", "end"]


def notice_for(user: User, season: Season, today: date) -> SeasonNotice | None:
    """Which season modal the player should see now, if any — each once per season.

    Nothing until the first-login tutorial is done (it explains seasons itself).
    In the last week the end notice wins: by then the start one is old news.
    """
    if not user.tutorial_completed:
        return None
    days_left = (season.ends_on - today).days
    if days_left <= END_NOTICE_DAYS and (user.season_end_seen or 0) < season.number:
        return "end"
    if (user.season_start_seen or 0) < season.number:
        return "start"
    return None


def mark_notice_seen(user: User, season: Season, notice: SeasonNotice) -> None:
    user.season_start_seen = max(user.season_start_seen or 0, season.number)
    if notice == "end":
        user.season_end_seen = max(user.season_end_seen or 0, season.number)


@dataclass(frozen=True)
class SeasonRanks:
    best: Rank
    last_season: Rank | None


def ranks_for(stats: UserStats | None) -> SeasonRanks:
    """Best rank ever (closed seasons or the current one) and last season's."""
    if stats is None:
        return SeasonRanks(best=rank_from_level(1), last_season=None)
    best_level = max(stats.best_level, stats.level)
    last = stats.last_season_level
    return SeasonRanks(
        best=rank_from_level(best_level),
        last_season=rank_from_level(last) if last is not None else None,
    )


def season_payload(season: Season, today: date) -> dict[str, object]:
    return {
        "number": season.number,
        "name": season_name(season),
        "starts_on": season.starts_on.isoformat(),
        "ends_on": season.ends_on.isoformat(),
        "days_left": max(0, (season.ends_on - today).days),
    }


# --- champions and podiums ---------------------------------------------------------


def latest_closed(db: Session) -> Season | None:
    return db.scalar(
        select(Season).where(Season.closed_at.is_not(None)).order_by(Season.number.desc()).limit(1)
    )


# A podium finish (1st, 2nd or 3rd) earns a gold, silver or bronze trophy.
PODIUM = 3
# Season achievements unlock at the close for the top of the board; everyone else
# gets theirs on their next evaluation (any finished quiz).
EVALUATE_AT_CLOSE = 10


def season_trophies(db: Session, user_id: object) -> list[tuple[Season, int]]:
    """(season, position) for every closed season this player finished on the podium,
    most recent first."""
    rows = db.execute(
        select(Season, SeasonResult.position)
        .join(SeasonResult, SeasonResult.season_id == Season.id)
        .where(SeasonResult.user_id == user_id, SeasonResult.position <= PODIUM)
        .order_by(Season.number.desc())
    ).all()
    return [(season, position) for season, position in rows]


def podium(db: Session, season: Season) -> list[SeasonResult]:
    """The top three of a closed season (positions 1-3; inactive accounts have none)."""
    return list(
        db.scalars(
            select(SeasonResult)
            .where(SeasonResult.season_id == season.id, SeasonResult.position.is_not(None))
            .where(SeasonResult.position <= 3)
            .order_by(SeasonResult.position)
        ).all()
    )


@dataclass(frozen=True)
class Celebration:
    season: Season
    final_xp: int
    position: int  # 1, 2 or 3


def podium_celebration(db: Session, user: User) -> Celebration | None:
    """Who finished the last closed season on the podium gets a one-off celebration
    on their next visit (the champion's is the big one)."""
    season = latest_closed(db)
    if season is None or (user.podium_seen_season or 0) >= season.number:
        return None
    result = db.scalar(
        select(SeasonResult).where(
            SeasonResult.season_id == season.id,
            SeasonResult.user_id == user.id,
            SeasonResult.position <= PODIUM,
        )
    )
    if result is None or result.position is None:
        return None
    return Celebration(season=season, final_xp=result.final_xp, position=result.position)


def mark_podium_seen(db: Session, user: User) -> None:
    season = latest_closed(db)
    if season is not None:
        user.podium_seen_season = max(user.podium_seen_season or 0, season.number)


def _award_season_achievements(db: Session, season: Season) -> None:
    """Right after a close, unlock season achievements for the top of the board."""
    top = db.scalars(
        select(User)
        .join(SeasonResult, SeasonResult.user_id == User.id)
        .where(SeasonResult.season_id == season.id, SeasonResult.position <= EVALUATE_AT_CLOSE)
    ).all()
    for user in top:
        if user.stats is not None:
            achievement_service.evaluate_achievements(db, user, user.stats)


def season_ref(season: Season) -> dict[str, object]:
    return {"number": season.number, "name": season_name(season)}

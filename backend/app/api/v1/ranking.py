from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbDep
from app.models import User
from app.schemas.ranking import (
    AccuracyEntry,
    AccuracyLeaderboardOut,
    AllTimePodiumOut,
    FriendsLeaderboardOut,
    GlobalLeaderboardOut,
    LeaderboardEntry,
    PodiumEntryOut,
    SeasonOut,
    SeasonRefOut,
)
from app.schemas.social import PublicUser
from app.schemas.user import RankOut
from app.services import ranking_service, season_service
from app.services.gamification import Rank, level_from_total_xp, rank_from_level
from app.services.ranking_service import (
    ACCURACY_MIN_RANK,
    ACCURACY_RANK_CODES,
    AccuracyPlayer,
    RankedPlayer,
    rank_by_code,
)

router = APIRouter(prefix="/ranking", tags=["ranking"])


def _public(user: User) -> PublicUser:
    stats = user.stats
    xp = stats.total_xp if stats else 0
    level, _, _ = level_from_total_xp(xp)
    rank = rank_from_level(level)
    return PublicUser(
        id=user.id,
        username=user.username,
        name=user.name,
        level=level,
        rank=RankOut(code=rank.code, name=rank.name),
        duel_wins=stats.duel_wins if stats else 0,
        duel_losses=stats.duel_losses if stats else 0,
        duel_draws=stats.duel_draws if stats else 0,
    )


def _entry(row: RankedPlayer) -> LeaderboardEntry:
    return LeaderboardEntry(
        position=row.position,
        total_xp=row.total_xp,
        is_me=row.is_me,
        user=_public(row.user),
    )


def _accuracy_entry(row: AccuracyPlayer) -> AccuracyEntry:
    return AccuracyEntry(
        position=row.position,
        accuracy=row.accuracy,
        questions_answered=row.questions_answered,
        correct_answers=row.correct_answers,
        is_me=row.is_me,
        user=_public(row.user),
    )


@router.get("/global", response_model=GlobalLeaderboardOut)
def global_ranking(user: CurrentUser, db: DbDep) -> GlobalLeaderboardOut:
    board = ranking_service.global_board(db, user)
    season, _ = season_service.ensure_current_season(db, season_service.season_today())
    return GlobalLeaderboardOut(
        season=SeasonOut.model_validate(
            season_service.season_payload(season, season_service.season_today())
        ),
        top=[_entry(row) for row in board.top],
        me=_entry(board.me),
        total_players=board.total_players,
    )


@router.get("/friends", response_model=FriendsLeaderboardOut)
def friends_ranking(user: CurrentUser, db: DbDep) -> FriendsLeaderboardOut:
    rows = ranking_service.friends_board(db, user)
    return FriendsLeaderboardOut(entries=[_entry(row) for row in rows])


def _rank_out(rank: Rank) -> RankOut:
    return RankOut(code=rank.code, name=rank.name)


@router.get("/accuracy", response_model=AccuracyLeaderboardOut)
def accuracy_ranking(
    user: CurrentUser,
    db: DbDep,
    elo: str | None = Query(None, description="One elo from Espiga up; omit for all of them."),
) -> AccuracyLeaderboardOut:
    if elo is not None and elo not in ACCURACY_RANK_CODES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Elo inválido. Use um destes: {', '.join(ACCURACY_RANK_CODES)}.",
        )
    board = ranking_service.accuracy_board(db, user, rank_by_code(elo) if elo else None)
    return AccuracyLeaderboardOut(
        elo=elo,
        elos=[_rank_out(rank_by_code(code)) for code in ACCURACY_RANK_CODES],
        min_rank=_rank_out(ACCURACY_MIN_RANK),
        min_level=ACCURACY_MIN_RANK.min_level,
        eligible=board.eligible,
        top=[_accuracy_entry(row) for row in board.top],
        me=_accuracy_entry(board.me) if board.me else None,
        total_players=board.total_players,
    )


@router.get("/all-time", response_model=AllTimePodiumOut)
def all_time_podium(user: CurrentUser, db: DbDep) -> AllTimePodiumOut:
    """The three best single-season scores ever, one per player."""
    entries = ranking_service.all_time_podium(db, user)
    return AllTimePodiumOut(
        podium=[
            PodiumEntryOut(
                position=e.position,
                score=e.score,
                season=SeasonRefOut(
                    number=e.season.number, name=season_service.season_name(e.season)
                ),
                live=e.live,
                is_me=e.is_me,
                user=_public(e.user),
            )
            for e in entries
        ]
    )

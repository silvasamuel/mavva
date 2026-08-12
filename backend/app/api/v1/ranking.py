from fastapi import APIRouter

from app.core.deps import CurrentUser, DbDep
from app.models import User
from app.schemas.ranking import FriendsLeaderboardOut, GlobalLeaderboardOut, LeaderboardEntry
from app.schemas.social import PublicUser
from app.schemas.user import RankOut
from app.services import ranking_service
from app.services.gamification import level_from_total_xp, rank_from_level
from app.services.ranking_service import RankedPlayer

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


@router.get("/global", response_model=GlobalLeaderboardOut)
def global_ranking(user: CurrentUser, db: DbDep) -> GlobalLeaderboardOut:
    board = ranking_service.global_board(db, user)
    return GlobalLeaderboardOut(
        top=[_entry(row) for row in board.top],
        me=_entry(board.me),
        total_players=board.total_players,
    )


@router.get("/friends", response_model=FriendsLeaderboardOut)
def friends_ranking(user: CurrentUser, db: DbDep) -> FriendsLeaderboardOut:
    rows = ranking_service.friends_board(db, user)
    return FriendsLeaderboardOut(entries=[_entry(row) for row in rows])

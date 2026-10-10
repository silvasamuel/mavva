from pydantic import BaseModel

from app.schemas.social import PublicUser
from app.schemas.user import RankOut


class LeaderboardEntry(BaseModel):
    position: int
    total_xp: int
    is_me: bool
    user: PublicUser


class GlobalLeaderboardOut(BaseModel):
    top: list[LeaderboardEntry]
    me: LeaderboardEntry
    total_players: int


class FriendsLeaderboardOut(BaseModel):
    entries: list[LeaderboardEntry]


class AccuracyEntry(BaseModel):
    position: int
    accuracy: float  # 0 to 1, lifetime correct / answered
    questions_answered: int
    correct_answers: int
    is_me: bool
    user: PublicUser


class AccuracyLeaderboardOut(BaseModel):
    elo: str | None  # the elo filter applied; null = every elo from min_rank up
    elos: list[RankOut]  # the elos that can be picked, min_rank first
    min_rank: RankOut  # below it (Espiga), players don't enter the board
    min_level: int
    eligible: bool  # the caller reached min_rank
    top: list[AccuracyEntry]
    me: AccuracyEntry | None  # null below min_rank or outside the chosen elo
    total_players: int  # in the chosen elo

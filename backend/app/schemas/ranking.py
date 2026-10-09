from pydantic import BaseModel

from app.schemas.social import PublicUser


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
    top: list[AccuracyEntry]
    me: AccuracyEntry | None  # null until my_answers reaches min_answers
    my_answers: int
    min_answers: int
    total_players: int  # only players who reached min_answers

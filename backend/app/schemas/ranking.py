from datetime import date

from pydantic import BaseModel

from app.schemas.social import PublicUser


class SeasonOut(BaseModel):
    number: int
    name: str  # "outubro de 2026"
    starts_on: date
    ends_on: date  # first day of the next season (exclusive)
    days_left: int


class LeaderboardEntry(BaseModel):
    position: int
    total_xp: int
    is_me: bool
    user: PublicUser


class GlobalLeaderboardOut(BaseModel):
    season: SeasonOut  # XP and the board restart when it ends
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

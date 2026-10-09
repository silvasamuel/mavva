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

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

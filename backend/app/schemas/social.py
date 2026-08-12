import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.models.enums import DuelMode, DuelStatus
from app.schemas.user import RankOut

Username = Annotated[
    str,
    StringConstraints(
        min_length=3, max_length=20, pattern=r"^[a-z0-9_]+$", strip_whitespace=True, to_lower=True
    ),
]


class PublicUser(BaseModel):
    """What a player may see about someone else — no e-mail."""

    id: uuid.UUID
    username: str
    name: str
    level: int
    rank: RankOut
    duel_wins: int
    duel_losses: int
    duel_draws: int


RelationStatus = Literal["none", "pending_sent", "pending_received", "friends"]


class UserSearchResult(BaseModel):
    user: PublicUser
    relation: RelationStatus


class FriendRequestIn(BaseModel):
    username: Username


class FriendRequestOut(BaseModel):
    id: uuid.UUID
    user: PublicUser  # the other side of the request
    created_at: datetime


class FriendsOverview(BaseModel):
    friends: list[PublicUser]
    incoming: list[FriendRequestOut]
    sent: list[FriendRequestOut]


# --- Duels ---


class DuelCreateRequest(BaseModel):
    opponent_username: Username | None = None


class DuelSide(BaseModel):
    user: PublicUser | None
    correct: int
    answered: int
    finished: bool
    time_seconds: int


class DuelOut(BaseModel):
    id: uuid.UUID
    mode: DuelMode
    status: DuelStatus
    created_at: datetime
    expires_at: datetime
    me: DuelSide
    rival: DuelSide
    my_session_id: uuid.UUID | None
    my_result: Literal["win", "loss", "draw"] | None
    xp_change: int | None
    question_count: int
    timer_seconds: int


class DuelRecord(BaseModel):
    wins: int
    losses: int
    draws: int
    current_streak: int
    best_streak: int
    win_rate: float | None


class DuelListOut(BaseModel):
    items: list[DuelOut]
    record: DuelRecord
    awaiting_me: int = Field(description="Duels where it is my turn to play")

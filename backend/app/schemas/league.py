import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.models.enums import Difficulty, LeagueFormat, LeagueMemberStatus, LeagueStatus
from app.schemas.social import PublicUser
from app.schemas.user import Username

LeagueName = Annotated[str, StringConstraints(min_length=3, max_length=40, strip_whitespace=True)]


class LeagueCreate(BaseModel):
    name: LeagueName
    format: LeagueFormat
    category_ids: list[int] = Field(min_length=1, max_length=100)
    difficulties: list[Difficulty] = Field(min_length=1, max_length=4)
    rounds: int | None = None  # points format only
    ends_on: date  # last day of play, Brasília calendar
    question_count: int = 10  # per fixture, 5 to 20
    timer_seconds: int = 20  # per question, one of the offered choices


class LeagueInviteIn(BaseModel):
    username: Username


class LeagueOut(BaseModel):
    """A league as it shows on the list: enough to file it and say whose turn it is."""

    id: uuid.UUID
    name: str
    format: LeagueFormat
    status: LeagueStatus
    rounds: int | None
    ends_on: date
    ends_at: datetime
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    owner: PublicUser
    is_owner: bool
    my_status: LeagueMemberStatus
    member_count: int  # players in
    invited_count: int  # invites not answered yet
    max_members: int
    champion: PublicUser | None
    # The fixture waiting for me right now, if any.
    my_match_id: uuid.UUID | None
    # Cup: until when that match can be played before it goes by walkover.
    my_match_deadline_at: datetime | None = None
    # For the invite link. Only the admin gets it, and only while recruiting.
    invite_code: str | None = None


class LeagueListOut(BaseModel):
    # False for players who aren't supporters: they can look, not create or play.
    can_play: bool
    leagues: list[LeagueOut]


class LeagueCategoryOut(BaseModel):
    id: int
    slug: str
    name: str
    icon: str


class LeagueMemberOut(BaseModel):
    user: PublicUser
    status: LeagueMemberStatus
    is_owner: bool


class LeagueStandingOut(BaseModel):
    position: int
    user: PublicUser
    is_me: bool
    points: int
    correct: int
    time_seconds: int
    played: int
    wins: int  # cup only
    eliminated: bool  # cup only


class LeagueScoreOut(BaseModel):
    points: int
    correct: int
    time_seconds: int


class LeagueRoundOut(BaseModel):
    """One round of a points league, from the caller's side."""

    match_id: uuid.UUID
    round: int
    played_count: int  # members who finished it
    my_score: LeagueScoreOut | None  # set once I finished it
    in_progress: bool  # I started it and haven't finished


class LeagueSideOut(BaseModel):
    """One seat of a cup match."""

    user: PublicUser | None  # None until the feeder match is decided
    from_match: int | None  # "winner of match N" while user is None
    vacant: bool = False  # the feeder match had no winner: nobody takes this seat
    played: bool
    score: LeagueScoreOut | None  # only once the match is decided


class LeagueCupMatchOut(BaseModel):
    id: uuid.UUID
    number: int  # running number across the bracket, for "winner of match N"
    a: LeagueSideOut
    b: LeagueSideOut
    winner_id: uuid.UUID | None
    decided_by: Literal["points", "time", "lots", "walkover", "void"] | None
    deadline_at: datetime | None  # play by then or lose by walkover


class LeagueCupRoundOut(BaseModel):
    round: int
    label: str  # "Rodada 1", "Semifinal", "Final"
    matches: list[LeagueCupMatchOut]
    # Players who rest this round and go straight to the next one.
    byes: list[LeagueSideOut]


class LeagueDetailOut(LeagueOut):
    can_play: bool
    categories: list[LeagueCategoryOut]
    difficulties: list[Difficulty]
    question_count: int
    timer_seconds: int
    members: list[LeagueMemberOut]
    standings: list[LeagueStandingOut]
    rounds_played: list[LeagueRoundOut]  # points format; empty otherwise
    bracket: list[LeagueCupRoundOut]  # cup format; empty otherwise


class LeaguePlayOut(BaseModel):
    session_id: uuid.UUID


class LeagueInvitePreviewOut(BaseModel):
    """What the invite link shows to whoever opens it, signed in or not."""

    name: str
    format: LeagueFormat
    status: LeagueStatus
    rounds: int | None
    ends_on: date
    admin_name: str
    admin_username: str
    member_count: int
    max_members: int
    question_count: int
    timer_seconds: int
    # False once the league has started, ended or filled up.
    open: bool


class LeagueInviteRedeemOut(BaseModel):
    league_id: uuid.UUID

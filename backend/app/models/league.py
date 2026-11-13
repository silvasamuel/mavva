import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import LeagueFormat, LeagueMemberStatus, LeagueStatus
from app.models.quiz import QuizSession
from app.models.user import User


def _enum(enum_cls: type, name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class League(Base):
    """A private, invite-only competition over a chosen slice of the question bank.

    Two formats: `points` (every member plays every round; most points by the
    end date wins) and `cup` (a knockout bracket drawn when the league starts).
    """

    __tablename__ = "leagues"
    __table_args__ = (Index("ix_leagues_status", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(40))
    format: Mapped[LeagueFormat] = mapped_column(_enum(LeagueFormat, "league_format"))
    status: Mapped[LeagueStatus] = mapped_column(
        _enum(LeagueStatus, "league_status"), default=LeagueStatus.RECRUITING
    )
    # What may be asked: category ids and difficulty values (snapshots, not FKs).
    category_ids: Mapped[list[int]] = mapped_column(JSONB)
    difficulties: Mapped[list[str]] = mapped_column(JSONB)
    # Points format only: how many rounds the owner chose.
    rounds: Mapped[int | None] = mapped_column(default=None)
    # First instant after the last day of play (midnight in Brasília).
    ends_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    champion_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    champion: Mapped[User | None] = relationship(foreign_keys=[champion_id])
    members: Mapped[list["LeagueMember"]] = relationship(
        back_populates="league", cascade="all, delete-orphan"
    )
    matches: Mapped[list["LeagueMatch"]] = relationship(
        back_populates="league",
        cascade="all, delete-orphan",
        order_by="(LeagueMatch.round, LeagueMatch.position)",
    )


class LeagueMember(Base):
    __tablename__ = "league_members"
    __table_args__ = (
        UniqueConstraint("league_id", "user_id"),
        Index("ix_league_members_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[LeagueMemberStatus] = mapped_column(
        _enum(LeagueMemberStatus, "league_member_status"), default=LeagueMemberStatus.INVITED
    )
    invited_at: Mapped[datetime] = mapped_column(server_default=func.now())
    joined_at: Mapped[datetime | None] = mapped_column(default=None)

    league: Mapped[League] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class LeagueMatch(Base):
    """One fixture: a round of a points league, or a 1v1 match of a cup.

    Everyone who plays it gets the SAME frozen questions (`question_ids`).
    A points round has no players of its own: every member plays it. A cup
    match names its two players, or the earlier matches (`feeder_*`) whose
    winners will fill the seats.
    """

    __tablename__ = "league_matches"
    __table_args__ = (UniqueConstraint("league_id", "round", "position"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"), index=True
    )
    round: Mapped[int]  # 1-based
    position: Mapped[int]  # order inside the round, 1-based
    question_ids: Mapped[list[str]] = mapped_column(JSONB)

    player_a_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    player_b_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    feeder_a_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("league_matches.id", ondelete="SET NULL"), default=None
    )
    feeder_b_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("league_matches.id", ondelete="SET NULL"), default=None
    )
    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    # How a cup match was settled: "points", "time" (same points, faster) or
    # "lots" (still tied: drawn at random, since a bracket needs a winner).
    decided_by: Mapped[str | None] = mapped_column(String(10), default=None)
    resolved_at: Mapped[datetime | None] = mapped_column(default=None)

    league: Mapped[League] = relationship(back_populates="matches")
    entries: Mapped[list["LeagueEntry"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )


class LeagueEntry(Base):
    """One player's go at a fixture: the quiz session they played and its score."""

    __tablename__ = "league_entries"
    __table_args__ = (UniqueConstraint("match_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("league_matches.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE"), unique=True
    )
    # Filled when the session ends (completed or abandoned).
    points: Mapped[int] = mapped_column(default=0)
    correct: Mapped[int] = mapped_column(default=0)
    time_seconds: Mapped[int] = mapped_column(default=0)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)

    match: Mapped[LeagueMatch] = relationship(back_populates="entries")
    session: Mapped[QuizSession] = relationship()

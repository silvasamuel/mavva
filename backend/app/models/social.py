import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DuelMode, DuelStatus, FriendshipStatus
from app.models.quiz import QuizSession
from app.models.user import User


def _enum(enum_cls: type, name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class Friendship(Base):
    """One row per relationship, always stored from the requester's side."""

    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id"),
        Index("ix_friendships_addressee_status", "addressee_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requester_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    addressee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[FriendshipStatus] = mapped_column(
        _enum(FriendshipStatus, "friendship_status"), default=FriendshipStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(default=None)

    requester: Mapped[User] = relationship(foreign_keys=[requester_id])
    addressee: Mapped[User] = relationship(foreign_keys=[addressee_id])


class Duel(Base):
    """A 1v1 match. Each side plays its own QuizSession over the SAME frozen questions.

    Reusing QuizSession means duel answers feed accuracy, category performance,
    spaced repetition and streaks exactly like any other study session.
    """

    __tablename__ = "duels"
    __table_args__ = (
        Index("ix_duels_status_mode", "status", "mode"),
        Index("ix_duels_challenger", "challenger_id"),
        Index("ix_duels_opponent", "opponent_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    mode: Mapped[DuelMode] = mapped_column(_enum(DuelMode, "duel_mode"))
    status: Mapped[DuelStatus] = mapped_column(
        _enum(DuelStatus, "duel_status"), default=DuelStatus.OPEN
    )

    challenger_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    challenger_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE")
    )
    opponent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=None
    )
    opponent_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE"), default=None
    )

    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    is_draw: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    resolved_at: Mapped[datetime | None] = mapped_column(default=None)

    challenger: Mapped[User] = relationship(foreign_keys=[challenger_id])
    opponent: Mapped[User | None] = relationship(foreign_keys=[opponent_id])
    challenger_session: Mapped[QuizSession] = relationship(foreign_keys=[challenger_session_id])
    opponent_session: Mapped[QuizSession | None] = relationship(foreign_keys=[opponent_session_id])

import uuid
from typing import Any

from sqlalchemy import Enum, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import QuestionFlagReason, QuestionFlagStatus, QuestionProposalStatus
from app.models.question import Question
from app.models.user import User


def _enum(enum_cls: type, name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class QuestionFlag(TimestampMixin, Base):
    """A player report of an error or inconsistency on an existing question."""

    __tablename__ = "question_flags"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id"),
        Index("ix_question_flags_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="SET NULL"), default=None
    )
    reason: Mapped[QuestionFlagReason] = mapped_column(
        _enum(QuestionFlagReason, "question_flag_reason")
    )
    comment: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[QuestionFlagStatus] = mapped_column(
        _enum(QuestionFlagStatus, "question_flag_status"), default=QuestionFlagStatus.OPEN
    )

    user: Mapped[User] = relationship()
    question: Mapped[Question] = relationship()


class QuestionProposal(TimestampMixin, Base):
    """A player-submitted question waiting for admin review."""

    __tablename__ = "question_proposals"
    __table_args__ = (Index("ix_question_proposals_status", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[QuestionProposalStatus] = mapped_column(
        _enum(QuestionProposalStatus, "question_proposal_status"),
        default=QuestionProposalStatus.PENDING,
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("questions.id", ondelete="SET NULL"), default=None
    )

    user: Mapped[User] = relationship()
    question: Mapped[Question | None] = relationship()

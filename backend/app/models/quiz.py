import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Enum, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import QuizMode
from app.models.question import Question


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    mode: Mapped[QuizMode] = mapped_column(
        Enum(QuizMode, name="quiz_mode", values_callable=lambda e: [m.value for m in e]),
        default=QuizMode.PRACTICE,
    )
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    question_count: Mapped[int]
    correct_count: Mapped[int] = mapped_column(default=0)
    xp_earned: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime] = mapped_column(server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    abandoned_at: Mapped[datetime | None] = mapped_column(default=None)
    duration_seconds: Mapped[int | None] = mapped_column(default=None)

    session_questions: Mapped[list["QuizSessionQuestion"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="QuizSessionQuestion.position",
    )
    answers: Mapped[list["QuizAnswer"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class QuizSessionQuestion(Base):
    """Questions drawn and frozen at session creation — fixed order, no re-rolls."""

    __tablename__ = "quiz_session_questions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int]

    session: Mapped[QuizSession] = relationship(back_populates="session_questions")
    question: Mapped[Question] = relationship()


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    __table_args__ = (UniqueConstraint("session_id", "question_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_sessions.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    selected_option_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("question_options.id", ondelete="SET NULL"), default=None
    )
    answer_text: Mapped[str | None] = mapped_column(Text, default=None)
    is_correct: Mapped[bool]
    time_spent_seconds: Mapped[int | None] = mapped_column(default=None)
    answered_at: Mapped[datetime] = mapped_column(server_default=func.now())

    session: Mapped[QuizSession] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship()

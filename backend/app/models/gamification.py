import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.question import Question


class DailyActivity(Base):
    """One row per user per day (date already in the user's timezone)."""

    __tablename__ = "daily_activities"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    xp: Mapped[int] = mapped_column(default=0)
    questions: Mapped[int] = mapped_column(default=0)
    correct: Mapped[int] = mapped_column(default=0)
    time_seconds: Mapped[int] = mapped_column(default=0)


class ReviewItem(Base):
    """Spaced-repetition state per (user, question) — simplified SM-2."""

    __tablename__ = "review_items"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id"),
        Index("ix_review_items_user_due", "user_id", "due_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    repetitions: Mapped[int] = mapped_column(default=0)
    ease_factor: Mapped[float] = mapped_column(default=2.5)
    interval_days: Mapped[int] = mapped_column(default=1)
    due_date: Mapped[date] = mapped_column(Date)
    lapses: Mapped[int] = mapped_column(default=0)
    last_reviewed_at: Mapped[datetime] = mapped_column(server_default=func.now())

    question: Mapped[Question] = relationship()


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(16))
    criteria: Mapped[dict[str, Any]] = mapped_column(JSONB)


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"), primary_key=True
    )
    unlocked_at: Mapped[datetime] = mapped_column(server_default=func.now())

    achievement: Mapped[Achievement] = relationship()

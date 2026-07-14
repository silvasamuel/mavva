import uuid

from sqlalchemy import Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import Difficulty, QuestionType, Testament


def _enum(enum_cls: type, name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(16), default="📖")
    display_order: Mapped[int] = mapped_column(default=0)

    questions: Mapped[list["Question"]] = relationship(back_populates="category")


class Question(TimestampMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_questions_category_difficulty", "category_id", "difficulty"),
        Index("ix_questions_testament", "testament"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String(60), unique=True)
    type: Mapped[QuestionType] = mapped_column(_enum(QuestionType, "question_type"))
    text: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    divergence_note: Mapped[str | None] = mapped_column(Text, default=None)

    testament: Mapped[Testament] = mapped_column(_enum(Testament, "testament"))
    book: Mapped[str] = mapped_column(String(40))
    chapter: Mapped[int]
    verse_start: Mapped[int]
    verse_end: Mapped[int | None] = mapped_column(default=None)

    theme: Mapped[str] = mapped_column(String(80))
    difficulty: Mapped[Difficulty] = mapped_column(_enum(Difficulty, "difficulty"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    subcategory: Mapped[str | None] = mapped_column(String(80), default=None)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    is_active: Mapped[bool] = mapped_column(default=True)

    category: Mapped[Category] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionOption.position",
    )
    accepted_answers: Mapped[list["QuestionAnswer"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionAnswer.position",
    )


class QuestionOption(Base):
    __tablename__ = "question_options"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(default=0)

    question: Mapped[Question] = relationship(back_populates="options")


class QuestionAnswer(Base):
    """Accepted answer variations for open-answer questions (position 0 = canonical)."""

    __tablename__ = "question_answers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(default=0)

    question: Mapped[Question] = relationship(back_populates="accepted_answers")

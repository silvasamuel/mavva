"""Loads and validates the versioned question bank in content/questions/*.json.

Validation runs even without a database (`--validate-only`) so CI can gate content PRs.
"""

import json
from pathlib import Path

from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.data.books import BOOKS
from app.models import Question, QuestionAnswer, QuestionOption
from app.models.enums import Difficulty, QuestionType


class ReferenceIn(BaseModel):
    book: str
    chapter: int = Field(ge=1)
    verse_start: int = Field(ge=1)
    verse_end: int | None = Field(default=None, ge=1)

    @field_validator("book")
    @classmethod
    def book_must_exist(cls, value: str) -> str:
        if value not in BOOKS:
            raise ValueError(f"livro desconhecido: {value!r}")
        return value

    @model_validator(mode="after")
    def verse_range_is_ordered(self) -> "ReferenceIn":
        if self.verse_end is not None and self.verse_end < self.verse_start:
            raise ValueError("verse_end menor que verse_start")
        return self


class OptionIn(BaseModel):
    text: str = Field(min_length=1)
    correct: bool


class QuestionIn(BaseModel):
    external_id: str = Field(min_length=3, max_length=60)
    type: QuestionType
    text: str = Field(min_length=10)
    options: list[OptionIn] | None = None
    accepted_answers: list[str] | None = None
    explanation: str = Field(min_length=10)
    divergence_note: str | None = None
    reference: ReferenceIn
    theme: str = Field(min_length=2, max_length=80)
    difficulty: Difficulty
    subcategory: str | None = Field(default=None, max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def type_specific_fields(self) -> "QuestionIn":
        if self.type == QuestionType.MULTIPLE_CHOICE:
            if not self.options or len(self.options) != 4:
                raise ValueError("multiple_choice exige exatamente 4 alternativas")
            if sum(1 for o in self.options if o.correct) != 1:
                raise ValueError("multiple_choice exige exatamente 1 alternativa correta")
        else:
            if not self.accepted_answers or not all(a.strip() for a in self.accepted_answers):
                raise ValueError("open_answer exige accepted_answers não vazias")
            if self.options:
                raise ValueError("open_answer não deve ter alternativas")
        return self


class QuestionFileIn(BaseModel):
    category: str
    questions: list[QuestionIn] = Field(min_length=1)

    @model_validator(mode="after")
    def external_ids_match_category(self) -> "QuestionFileIn":
        for q in self.questions:
            if not q.external_id.startswith(f"{self.category}-"):
                raise ValueError(f"external_id {q.external_id!r} não começa com {self.category!r}-")
        return self


def load_content_files(content_dir: Path) -> list[QuestionFileIn]:
    questions_dir = content_dir / "questions"
    files = sorted(questions_dir.glob("*.json"))
    if not files:
        raise FileNotFoundError(f"Nenhum arquivo de perguntas em {questions_dir}")

    parsed: list[QuestionFileIn] = []
    seen_ids: dict[str, Path] = {}
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        try:
            file_in = QuestionFileIn.model_validate(data)
        except Exception as error:
            raise ValueError(f"{path.name}: {error}") from error
        for q in file_in.questions:
            if q.external_id in seen_ids:
                raise ValueError(
                    f"{path.name}: external_id duplicado {q.external_id!r} "
                    f"(também em {seen_ids[q.external_id].name})"
                )
            seen_ids[q.external_id] = path
        parsed.append(file_in)
    return parsed


def seed_questions(db: Session, content_dir: Path, category_ids: dict[str, int]) -> tuple[int, int]:
    """Upserts by external_id. Returns (created, updated)."""
    files = load_content_files(content_dir)
    existing = {
        q.external_id: q
        for q in db.scalars(
            select(Question).options(
                selectinload(Question.options), selectinload(Question.accepted_answers)
            )
        )
    }
    created = updated = 0
    for file_in in files:
        if file_in.category not in category_ids:
            raise ValueError(f"Categoria desconhecida no seed: {file_in.category!r}")
        for q_in in file_in.questions:
            question = existing.get(q_in.external_id)
            if question is None:
                question = Question(external_id=q_in.external_id)
                db.add(question)
                created += 1
            else:
                updated += 1
            question.type = q_in.type
            question.text = q_in.text
            question.explanation = q_in.explanation
            question.divergence_note = q_in.divergence_note
            question.book = q_in.reference.book
            question.testament = BOOKS[q_in.reference.book].testament
            question.chapter = q_in.reference.chapter
            question.verse_start = q_in.reference.verse_start
            question.verse_end = q_in.reference.verse_end
            question.theme = q_in.theme
            question.difficulty = q_in.difficulty
            question.category_id = category_ids[file_in.category]
            question.subcategory = q_in.subcategory
            question.tags = [t.strip().lower() for t in q_in.tags]
            question.is_active = True

            # Replace answer key wholesale — content files are the source of truth.
            question.options.clear()
            question.accepted_answers.clear()
            if q_in.type == QuestionType.MULTIPLE_CHOICE and q_in.options:
                question.options.extend(
                    QuestionOption(text=o.text, is_correct=o.correct, position=i)
                    for i, o in enumerate(q_in.options)
                )
            elif q_in.accepted_answers:
                question.accepted_answers.extend(
                    QuestionAnswer(text=a.strip(), position=i)
                    for i, a in enumerate(q_in.accepted_answers)
                )
    db.flush()
    return created, updated

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.enums import (
    Difficulty,
    QuestionFlagReason,
    QuestionFlagStatus,
    QuestionProposalStatus,
    QuestionType,
)
from app.seeds.questions import OptionIn


class QuestionDraft(BaseModel):
    """Player- or admin-authored question body (no external_id until approved)."""

    category_id: int
    type: QuestionType
    text: str = Field(min_length=10)
    options: list[OptionIn] | None = None
    accepted_answers: list[str] | None = None
    explanation: str = Field(min_length=10)
    divergence_note: str | None = None
    book: str
    chapter: int = Field(ge=1)
    verse_start: int = Field(ge=1)
    verse_end: int | None = Field(default=None, ge=1)
    difficulty: Difficulty

    @model_validator(mode="after")
    def type_specific_fields(self) -> "QuestionDraft":
        if self.verse_end is not None and self.verse_end < self.verse_start:
            raise ValueError("verse_end não pode ser menor que verse_start")
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


class FlagCreateRequest(BaseModel):
    question_id: uuid.UUID
    reason: QuestionFlagReason
    comment: str | None = Field(default=None, max_length=500)
    session_id: uuid.UUID | None = None


class FlagCreateResponse(BaseModel):
    id: uuid.UUID
    status: QuestionFlagStatus


class ProposalCreateResponse(BaseModel):
    id: uuid.UUID
    status: QuestionProposalStatus


class AdminFlagOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    reason: QuestionFlagReason
    comment: str | None
    status: QuestionFlagStatus
    reporter_name: str
    reporter_username: str
    question_id: uuid.UUID
    question_text: str
    question_external_id: str
    question_active: bool


class AdminProposalOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    status: QuestionProposalStatus
    author_name: str
    author_username: str
    payload: dict[str, Any]
    question_id: uuid.UUID | None = None


class AdminReviewInbox(BaseModel):
    open_flags: int
    pending_proposals: int
    flags: list[AdminFlagOut]
    proposals: list[AdminProposalOut]

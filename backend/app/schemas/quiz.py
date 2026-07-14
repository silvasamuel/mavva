import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.enums import Difficulty, QuestionType, QuizMode, Testament


class QuizCreateRequest(BaseModel):
    mode: QuizMode = QuizMode.PRACTICE
    question_count: int = Field(default=10, ge=1, le=20)
    testament: Testament | None = None
    category_ids: list[int] | None = Field(default=None, max_length=30)
    difficulty: Difficulty | None = None
    theme: str | None = Field(default=None, max_length=80)


class BibleReference(BaseModel):
    book: str
    book_name: str
    chapter: int
    verse_start: int
    verse_end: int | None
    display: str


class QuestionOptionOut(BaseModel):
    id: uuid.UUID
    text: str


class QuestionOut(BaseModel):
    """Question as seen while playing — no answer key leaves the server."""

    id: uuid.UUID
    position: int
    type: QuestionType
    text: str
    difficulty: Difficulty
    category_name: str
    category_icon: str
    options: list[QuestionOptionOut] = []
    answered: bool = False


class QuizSessionOut(BaseModel):
    id: uuid.UUID
    mode: QuizMode
    question_count: int
    correct_count: int
    answered_count: int
    completed: bool
    filters: dict[str, Any]
    questions: list[QuestionOut]


class AnswerRequest(BaseModel):
    question_id: uuid.UUID
    selected_option_id: uuid.UUID | None = None
    answer_text: str | None = Field(default=None, max_length=200)
    time_spent_seconds: int | None = Field(default=None, ge=0, le=3600)

    @model_validator(mode="after")
    def exactly_one_answer_kind(self) -> "AnswerRequest":
        if self.selected_option_id is None and not (self.answer_text or "").strip():
            raise ValueError("Envie selected_option_id ou answer_text")
        return self


class AnswerFeedback(BaseModel):
    is_correct: bool
    correct_option_id: uuid.UUID | None
    correct_answer: str | None
    explanation: str
    divergence_note: str | None
    reference: BibleReference
    xp_earned: int


class LevelInfo(BaseModel):
    current: int
    leveled_up: bool
    xp_into_level: int
    xp_for_next: int


class StreakInfo(BaseModel):
    current: int
    extended_today: bool


class DailyGoalInfo(BaseModel):
    target: int
    earned_today: int
    achieved: bool


class UnlockedAchievement(BaseModel):
    code: str
    name: str
    description: str
    icon: str


class QuizCompleteResponse(BaseModel):
    correct_count: int
    question_count: int
    answered_count: int
    accuracy: float
    xp_earned: int
    bonus_xp: int
    duration_seconds: int
    level: LevelInfo
    streak: StreakInfo
    daily_goal: DailyGoalInfo
    unlocked_achievements: list[UnlockedAchievement]


class QuizHistoryItem(BaseModel):
    id: uuid.UUID
    mode: QuizMode
    completed_at: datetime | None
    correct_count: int
    question_count: int
    xp_earned: int
    duration_seconds: int | None
    filters: dict[str, Any]

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models.enums import Difficulty, QuestionType, Testament, UserRole

# --- Users ---


class AdminUserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: UserRole
    timezone: str
    daily_goal_xp: int
    created_at: datetime
    total_xp: int
    level: int
    current_streak: int
    questions_answered: int
    accuracy: float | None


class AdminUserList(BaseModel):
    items: list[AdminUserOut]
    total: int
    limit: int
    offset: int


# --- Questions ---


class AdminOption(BaseModel):
    text: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    is_correct: bool


class AdminAnswer(BaseModel):
    text: Annotated[str, StringConstraints(min_length=1, max_length=120)]


class AdminQuestionListItem(BaseModel):
    id: uuid.UUID
    external_id: str
    type: QuestionType
    text: str
    difficulty: Difficulty
    category_id: int
    category_name: str
    is_active: bool


class AdminQuestionList(BaseModel):
    items: list[AdminQuestionListItem]
    total: int
    limit: int
    offset: int


class AdminQuestionDetail(BaseModel):
    id: uuid.UUID
    external_id: str
    type: QuestionType
    text: str
    explanation: str
    divergence_note: str | None
    testament: Testament
    book: str
    chapter: int
    verse_start: int
    verse_end: int | None
    theme: str
    difficulty: Difficulty
    category_id: int
    subcategory: str | None
    tags: list[str]
    is_active: bool
    options: list[AdminOption]
    accepted_answers: list[AdminAnswer]


class AdminQuestionUpdate(BaseModel):
    """Every field optional — only what is sent gets updated.

    `type` and `category_id` are immutable: external_id is prefixed by the
    category slug, so moving a question across categories would break the
    content-file invariants (revisit if the need ever arises).
    """

    text: str | None = Field(default=None, min_length=10)
    explanation: str | None = Field(default=None, min_length=10)
    divergence_note: str | None = None
    book: str | None = None
    chapter: int | None = Field(default=None, ge=1)
    verse_start: int | None = Field(default=None, ge=1)
    verse_end: int | None = Field(default=None, ge=1)
    theme: str | None = Field(default=None, min_length=2, max_length=80)
    difficulty: Difficulty | None = None
    subcategory: str | None = Field(default=None, max_length=80)
    tags: list[str] | None = Field(default=None, max_length=6)
    is_active: bool | None = None
    options: list[AdminOption] | None = None
    accepted_answers: list[AdminAnswer] | None = None

    @model_validator(mode="after")
    def verse_range_ordered(self) -> "AdminQuestionUpdate":
        if (
            self.verse_end is not None
            and self.verse_start is not None
            and self.verse_end < self.verse_start
        ):
            raise ValueError("verse_end não pode ser menor que verse_start")
        return self


class AdminCategoryOut(BaseModel):
    id: int
    slug: str
    name: str
    icon: str


# --- Content write-back ---


class ContentStatusOut(BaseModel):
    mode: str  # "github" | "local"
    dirty_files: list[str]


class ContentPublishOut(BaseModel):
    mode: str
    published: list[str]
    commit_url: str | None

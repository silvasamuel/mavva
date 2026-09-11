import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models.enums import Difficulty, QuestionType, Testament, UserRole

# --- Dashboard ---


class AdminDashboardUsers(BaseModel):
    total: int
    active: int
    unverified: int
    new_7d: int


class AdminDashboardQuestions(BaseModel):
    total: int
    active: int
    inactive: int
    open_answer: int
    old_testament: int
    easy: int
    medium: int
    hard: int
    expert: int


class AdminDashboardReview(BaseModel):
    flags_open: int
    proposals_pending: int
    pending: int


class AdminDashboardActivity(BaseModel):
    studied_today: int
    xp_today: int
    questions_answered: int
    accuracy: float | None
    total_xp: int
    longest_streak: int
    max_level: int
    duels_open: int
    duels_active: int
    duels_finished: int
    friendships: int


class AdminDashboardOut(BaseModel):
    users: AdminDashboardUsers
    questions: AdminDashboardQuestions
    review: AdminDashboardReview
    activity: AdminDashboardActivity


# --- Users ---


class AdminUserOut(BaseModel):
    id: uuid.UUID
    name: str
    username: str
    email: str
    role: UserRole
    timezone: str
    daily_goal_xp: int
    created_at: datetime
    email_verified_at: datetime | None
    is_active: bool
    total_xp: int
    level: int
    current_streak: int
    questions_answered: int
    accuracy: float | None


class AdminUserDetail(AdminUserOut):
    updated_at: datetime
    longest_streak: int
    last_activity_date: date | None
    correct_answers: int
    perfect_sessions: int
    total_time_seconds: int
    duel_wins: int
    duel_losses: int
    duel_draws: int
    current_duel_streak: int
    best_duel_streak: int


class AdminUserUpdate(BaseModel):
    is_active: bool


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
    difficulty: Difficulty
    category_id: int
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
    difficulty: Difficulty | None = None
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
    commit_url: str | None = None
    pr_url: str | None = None

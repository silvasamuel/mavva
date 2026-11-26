import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import Difficulty, QuizMode, Testament


class QuizCreateRequest(BaseModel):
    mode: QuizMode = QuizMode.PRACTICE
    question_count: int = Field(default=10, ge=1, le=20)
    testament: Testament | None = None
    category_ids: list[int] | None = Field(default=None, max_length=30)
    difficulty: Difficulty | None = None
    timer_seconds: Literal[15, 30] | None = None


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
    text: str
    difficulty: Difficulty
    category_name: str
    category_icon: str
    options: list[QuestionOptionOut]
    answered: bool = False
    timer_remaining: int | None = None


class QuizSessionOut(BaseModel):
    id: uuid.UUID
    mode: QuizMode
    question_count: int
    correct_count: int
    answered_count: int
    completed: bool
    timer_seconds: int | None
    duel_id: uuid.UUID | None = None  # set when this round belongs to a duel
    league_id: uuid.UUID | None = None  # set when it is a league round or cup match
    combo: int  # hits in a row so far, so a reload keeps the badge
    filters: dict[str, Any]
    questions: list[QuestionOut]


class PresentQuestionRequest(BaseModel):
    question_id: uuid.UUID


class PresentQuestionResponse(BaseModel):
    timer_remaining: int | None


class AnswerRequest(BaseModel):
    question_id: uuid.UUID
    selected_option_id: uuid.UUID | None = None
    time_spent_seconds: int | None = Field(default=None, ge=0, le=3600)
    timed_out: bool = False

    @model_validator(mode="after")
    def option_or_timeout(self) -> "AnswerRequest":
        if not self.timed_out and self.selected_option_id is None:
            raise ValueError("Envie selected_option_id ou timed_out")
        return self


class QuizAbandonResponse(BaseModel):
    answered_count: int
    wrong_count: int
    xp_penalty: int  # zero or negative — only the wrong answers are consolidated


class AnswerFeedback(BaseModel):
    is_correct: bool
    correct_option_id: uuid.UUID
    explanation: str
    divergence_note: str | None
    reference: BibleReference
    xp_earned: int  # combo_bonus_xp included
    combo: int  # hits in a row in this session, this answer included; a miss resets it to 0
    combo_bonus_xp: int  # always 0 in duels


class LevelInfo(BaseModel):
    current: int
    leveled_up: bool
    xp_into_level: int
    xp_for_next: int


class RankInfo(BaseModel):
    code: str
    name: str
    rank_up: bool


class WisdomInfo(BaseModel):
    """What the session did to the player's wisdom; `delta` 0 = nothing to show."""

    delta: int  # net points, negative when misses outweighed hits
    level: int  # 1 to 10, after the session
    previous_level: int  # before it: differs when the session crossed a level


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
    xp_reward: int


class QuizCompleteResponse(BaseModel):
    correct_count: int
    question_count: int
    answered_count: int
    accuracy: float
    xp_earned: int
    bonus_xp: int
    duration_seconds: int
    level: LevelInfo
    rank: RankInfo
    streak: StreakInfo
    daily_goal: DailyGoalInfo
    best_combo: int  # longest run of hits in the session
    wisdom: WisdomInfo
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

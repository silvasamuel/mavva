from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: int
    slug: str
    name: str
    description: str
    icon: str
    question_count: int
    answered: int
    accuracy: float | None


class AchievementOut(BaseModel):
    code: str
    name: str
    description: str
    icon: str
    unlocked_at: str | None
    progress_current: int
    progress_target: int


class ReviewSummaryOut(BaseModel):
    due_today: int
    due_this_week: int
    total_items: int

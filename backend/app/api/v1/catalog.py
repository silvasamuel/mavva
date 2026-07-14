from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep
from app.models import Question
from app.schemas.catalog import CategoryOut, ReviewSummaryOut
from app.services import srs
from app.services.gamification import today_for_user
from app.services.stats_service import category_performance

router = APIRouter(tags=["catalog"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(user: CurrentUser, db: DbDep) -> list[CategoryOut]:
    counts: dict[int, int] = {
        category_id: count
        for category_id, count in db.execute(
            select(Question.category_id, func.count())
            .where(Question.is_active)
            .group_by(Question.category_id)
        )
    }
    return [
        CategoryOut(
            id=c["id"],
            slug=c["slug"],
            name=c["name"],
            description=c["description"],
            icon=c["icon"],
            question_count=counts.get(c["id"], 0),
            answered=c["answered"],
            accuracy=c["accuracy"],
        )
        for c in category_performance(db, user)
    ]


@router.get("/reviews/summary", response_model=ReviewSummaryOut)
def reviews_summary(user: CurrentUser, db: DbDep) -> ReviewSummaryOut:
    summary = srs.review_summary(db, user.id, today_for_user(user))
    return ReviewSummaryOut(**summary)

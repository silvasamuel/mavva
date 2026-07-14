from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep
from app.models import Achievement, Category, UserAchievement, UserStats
from app.schemas.catalog import AchievementOut
from app.services.achievement_service import current_value

router = APIRouter(prefix="/achievements", tags=["achievements"])


@router.get("", response_model=list[AchievementOut])
def list_achievements(user: CurrentUser, db: DbDep) -> list[AchievementOut]:
    stats = db.get(UserStats, user.id)
    assert stats is not None
    unlocked = {
        ua.achievement_id: ua.unlocked_at
        for ua in db.scalars(select(UserAchievement).where(UserAchievement.user_id == user.id))
    }
    total_categories = db.scalar(select(func.count()).select_from(Category)) or 0

    result = []
    for achievement in db.scalars(select(Achievement).order_by(Achievement.id)):
        target = achievement.criteria.get("value", 0)
        if achievement.criteria.get("type") == "categories_covered":
            target = total_categories
        unlocked_at = unlocked.get(achievement.id)
        result.append(
            AchievementOut(
                code=achievement.code,
                name=achievement.name,
                description=achievement.description,
                icon=achievement.icon,
                unlocked_at=unlocked_at.isoformat() if unlocked_at else None,
                progress_current=min(current_value(db, user, stats, achievement.criteria), target),
                progress_target=target,
            )
        )
    return result

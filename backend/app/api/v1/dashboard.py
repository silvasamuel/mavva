from typing import Any

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbDep
from app.services.stats_service import get_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    return get_dashboard(db, user)

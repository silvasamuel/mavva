from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models import User
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DbDep) -> UserOut:
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except (KeyError, ValueError) as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fuso horário inválido") from error
        user.timezone = body.timezone
    if body.name is not None:
        user.name = body.name
    if body.username is not None and body.username != user.username:
        taken = db.scalar(select(User).where(User.username == body.username))
        if taken is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Este nome de usuário já está em uso")
        user.username = body.username
    if body.daily_goal_xp is not None:
        user.daily_goal_xp = body.daily_goal_xp
    db.commit()
    return UserOut.model_validate(user)

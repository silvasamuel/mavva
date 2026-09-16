from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models import User
from app.schemas.user import AccountDeleteRequest, UserOut, UserUpdate
from app.services.user_service import UserServiceError, delete_account, export_account

router = APIRouter(prefix="/users", tags=["users"])
REFRESH_COOKIE = "refresh_token"


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/me/export")
def export_me(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    return export_account(db, user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    body: AccountDeleteRequest, user: CurrentUser, db: DbDep, response: Response
) -> None:
    try:
        delete_account(db, user, body.password)
    except UserServiceError as error:
        raise HTTPException(error.status_code, error.message) from error
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")


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

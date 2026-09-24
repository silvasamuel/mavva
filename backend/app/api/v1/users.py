from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models import User
from app.schemas.user import AccountDeleteRequest, UserOut, UserUpdate
from app.services.user_service import UserServiceError, delete_account

REVIEW_SESSION_SIZES = {5, 10, 15, 20}
REVIEW_MAX_INTERVALS = {30, 90, 365}

router = APIRouter(prefix="/users", tags=["users"])
REFRESH_COOKIE = "refresh_token"


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


def _service_error(error: UserServiceError) -> HTTPException:
    headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
    return HTTPException(error.status_code, error.message, headers=headers)


# Self-service export used to live here (GET /me/export). It's admin-only for
# now — see /admin/users/{id}/export — while the download flow gets more
# review; players can still request a copy from the DPO by e-mail.


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(body: AccountDeleteRequest, user: CurrentUser, db: DbDep, response: Response) -> None:
    try:
        delete_account(db, user, body.password)
    except UserServiceError as error:
        raise _service_error(error) from error
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
    if body.review_spacing is not None:
        user.review_spacing = body.review_spacing
    if body.review_scope is not None:
        user.review_scope = body.review_scope
    if body.review_order is not None:
        user.review_order = body.review_order
    if body.review_session_size is not None:
        if body.review_session_size not in REVIEW_SESSION_SIZES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tamanho de sessão inválido")
        user.review_session_size = body.review_session_size
    if "review_max_interval_days" in body.model_fields_set:
        days = body.review_max_interval_days
        if days is not None and days not in REVIEW_MAX_INTERVALS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Intervalo máximo inválido")
        user.review_max_interval_days = days
    db.commit()
    return UserOut.model_validate(user)

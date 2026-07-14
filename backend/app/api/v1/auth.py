from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.core.deps import DbDep
from app.core.ratelimit import limiter
from app.core.security import create_access_token
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserOut
from app.services import auth_service, email_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_token,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        secure=settings.is_production,
        # Cross-site in production (Vercel frontend -> Render API) requires none+secure.
        samesite="none" if settings.is_production else "lax",
        path="/api/v1/auth",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
@limiter.limit("10/minute")
def register(
    request: Request, body: RegisterRequest, response: Response, db: DbDep
) -> TokenResponse:
    try:
        user = auth_service.register_user(db, body.name, body.email, body.password)
    except AuthError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, error.message) from error
    refresh = auth_service.issue_refresh_token(db, user.id)
    db.commit()
    _set_refresh_cookie(response, refresh)
    return TokenResponse(
        access_token=create_access_token(user.id), user=UserOut.model_validate(user)
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, response: Response, db: DbDep) -> TokenResponse:
    user = auth_service.authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos")
    refresh = auth_service.issue_refresh_token(db, user.id)
    db.commit()
    _set_refresh_cookie(response, refresh)
    return TokenResponse(
        access_token=create_access_token(user.id), user=UserOut.model_validate(user)
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, response: Response, db: DbDep) -> TokenResponse:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão não encontrada")
    try:
        user, new_raw = auth_service.rotate_refresh_token(db, raw)
    except AuthError as error:
        db.commit()  # persist family revocation on reuse detection
        response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, error.message) from error
    db.commit()
    _set_refresh_cookie(response, new_raw)
    return TokenResponse(
        access_token=create_access_token(user.id), user=UserOut.model_validate(user)
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DbDep) -> None:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        auth_service.revoke_refresh_token(db, raw)
        db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest, db: DbDep) -> dict[str, str]:
    result = auth_service.create_password_reset_token(db, body.email)
    if result is not None:
        user, raw_token = result
        db.commit()
        email_service.send_password_reset(user.email, user.name, raw_token)
    # Same response whether the account exists or not.
    return {"message": "Se o e-mail existir, você receberá um link de recuperação"}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordRequest, db: DbDep) -> None:
    try:
        auth_service.reset_password(db, body.token, body.new_password)
    except AuthError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error.message) from error
    db.commit()

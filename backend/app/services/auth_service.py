import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import generate_opaque_token, hash_password, hash_token, verify_password
from app.models import PasswordResetToken, RefreshToken, User, UserStats


class AuthError(Exception):
    def __init__(self, message: str):
        self.message = message


def register_user(db: Session, name: str, email: str, password: str) -> User:
    email = email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AuthError("Este e-mail já está cadastrado")
    user = User(name=name.strip(), email=email, hashed_password=hash_password(password))
    user.stats = UserStats()
    db.add(user)
    db.flush()
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user


def issue_refresh_token(db: Session, user_id: uuid.UUID) -> str:
    raw = generate_opaque_token()
    settings = get_settings()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.flush()
    return raw


def rotate_refresh_token(db: Session, raw: str) -> tuple[User, str]:
    """Validates + rotates. Reuse of a rotated token revokes the whole family."""
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if token is None:
        raise AuthError("Sessão inválida")
    if token.revoked_at is not None:
        # Token reuse: likely theft — kill every session for this user.
        _revoke_all_refresh_tokens(db, token.user_id)
        raise AuthError("Sessão revogada")
    if token.expires_at < datetime.now(UTC):
        raise AuthError("Sessão expirada")
    user = db.get(User, token.user_id)
    if user is None:
        raise AuthError("Usuário não encontrado")
    token.revoked_at = datetime.now(UTC)
    new_raw = issue_refresh_token(db, user.id)
    return user, new_raw


def revoke_refresh_token(db: Session, raw: str) -> None:
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if token is not None and token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)


def _revoke_all_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def create_password_reset_token(db: Session, email: str) -> tuple[User, str] | None:
    """Returns None silently for unknown e-mails (never reveal account existence)."""
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        return None
    raw = generate_opaque_token()
    settings = get_settings()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC) + timedelta(minutes=settings.reset_token_expire_minutes),
        )
    )
    db.flush()
    return user, raw


def reset_password(db: Session, raw_token: str, new_password: str) -> User:
    token = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw_token))
    )
    if token is None or token.used_at is not None or token.expires_at < datetime.now(UTC):
        raise AuthError("Link de recuperação inválido ou expirado")
    user = db.get(User, token.user_id)
    if user is None:
        raise AuthError("Usuário não encontrado")
    user.hashed_password = hash_password(new_password)
    token.used_at = datetime.now(UTC)
    _revoke_all_refresh_tokens(db, user.id)  # force re-login everywhere
    return user

import math
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import generate_opaque_token, hash_password, hash_token, verify_password
from app.models import EmailVerificationToken, PasswordResetToken, RefreshToken, User, UserStats


class AuthError(Exception):
    def __init__(self, message: str):
        self.message = message


@dataclass(frozen=True)
class EmailDispatch:
    """Send payload plus the wait the client should show on the resend button.

    Unknown, already-verified, and cooling-down accounts all look the same
    over the wire (202 + retry_after) so existence is never leaked.
    """

    user: User | None
    raw_token: str | None
    retry_after: int


def _retry_after(created_at: datetime | None, cooldown: int) -> int:
    if created_at is None:
        return 0
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    elapsed = (datetime.now(UTC) - created_at).total_seconds()
    return max(0, math.ceil(cooldown - elapsed))


USERNAME_PATTERN = re.compile(r"[^a-z0-9_]")


def generate_username(db: Session, email: str) -> str:
    """Derives a free handle from the e-mail local-part (same rule as the backfill)."""
    base = USERNAME_PATTERN.sub("", email.split("@")[0].lower())[:16] or "mavva"
    candidate, suffix = base, 1
    while db.scalar(select(User).where(User.username == candidate)):
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


def register_user(db: Session, name: str, email: str, password: str) -> User:
    email = email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AuthError("Este e-mail já está cadastrado")
    user = User(
        name=name.strip(),
        email=email,
        username=generate_username(db, email),
        hashed_password=hash_password(password),
    )
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
        revoke_all_refresh_tokens(db, token.user_id)
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


def revoke_all_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def create_password_reset_token(db: Session, email: str) -> EmailDispatch:
    """Never reveals whether the account exists; respects the resend cooldown."""
    cooldown = get_settings().email_resend_cooldown_seconds
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        return EmailDispatch(None, None, cooldown)
    last = db.scalar(
        select(func.max(PasswordResetToken.created_at)).where(PasswordResetToken.user_id == user.id)
    )
    remaining = _retry_after(last, cooldown)
    if remaining > 0:
        return EmailDispatch(None, None, remaining)
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
    return EmailDispatch(user, raw, cooldown)


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
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    revoke_all_refresh_tokens(db, user.id)  # force re-login everywhere
    return user


def _invalidate_unused_verification_tokens(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.used_at.is_(None),
        )
        .values(used_at=datetime.now(UTC))
    )


def create_email_verification_token(db: Session, user: User) -> str:
    _invalidate_unused_verification_tokens(db, user.id)
    raw = generate_opaque_token()
    settings = get_settings()
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC)
            + timedelta(hours=settings.verification_token_expire_hours),
        )
    )
    db.flush()
    return raw


def resend_email_verification(db: Session, email: str) -> EmailDispatch:
    """Never reveals whether the account exists; respects the resend cooldown."""
    cooldown = get_settings().email_resend_cooldown_seconds
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or user.email_verified_at is not None:
        return EmailDispatch(None, None, cooldown)
    last = db.scalar(
        select(func.max(EmailVerificationToken.created_at)).where(
            EmailVerificationToken.user_id == user.id
        )
    )
    remaining = _retry_after(last, cooldown)
    if remaining > 0:
        return EmailDispatch(None, None, remaining)
    return EmailDispatch(user, create_email_verification_token(db, user), cooldown)


def verify_email(db: Session, raw_token: str) -> User:
    token = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_token(raw_token)
        )
    )
    if token is None or token.used_at is not None or token.expires_at < datetime.now(UTC):
        raise AuthError("Link de confirmação inválido ou expirado")
    user = db.get(User, token.user_id)
    if user is None:
        raise AuthError("Usuário não encontrado")
    token.used_at = datetime.now(UTC)
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    return user

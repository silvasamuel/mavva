import math
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import RateLimitBucket


class RateLimitError(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        self.message = "Muitas tentativas. Tente de novo em instantes."


def _enabled() -> bool:
    return get_settings().rate_limit_enabled


def consume(db: Session, key: str, *, limit: int, window_seconds: int) -> None:
    if not _enabled():
        return
    now = datetime.now(UTC)
    row = db.scalar(select(RateLimitBucket).where(RateLimitBucket.key == key).with_for_update())
    if row is None or (now - row.window_started_at).total_seconds() >= window_seconds:
        if row is None:
            db.add(RateLimitBucket(key=key, window_started_at=now, count=1))
        else:
            row.window_started_at = now
            row.count = 1
        db.flush()
        return
    if row.count >= limit:
        remaining = max(
            1, math.ceil(window_seconds - (now - row.window_started_at).total_seconds())
        )
        raise RateLimitError(remaining)
    row.count += 1
    db.flush()


def consume_user(
    db: Session, user_id: UUID, action: str, *, limit: int, window_seconds: int
) -> None:
    consume(db, f"user:{user_id}:{action}", limit=limit, window_seconds=window_seconds)


def enforce_user_limit(
    db: Session, user_id: UUID, action: str, *, limit: int, window_seconds: int
) -> None:
    try:
        consume_user(db, user_id, action, limit=limit, window_seconds=window_seconds)
    except RateLimitError as error:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            error.message,
            headers={"Retry-After": str(error.retry_after)},
        ) from error

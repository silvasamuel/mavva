from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.rate_limit_service import RateLimitError, consume_user, enforce_user_limit


def test_user_bucket_blocks_after_the_limit(db: Session, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.rate_limit_service._enabled", lambda: True)
    user_id = uuid4()
    for _ in range(3):
        consume_user(db, user_id, "probe", limit=3, window_seconds=60)
    with pytest.raises(RateLimitError) as error:
        consume_user(db, user_id, "probe", limit=3, window_seconds=60)
    assert error.value.retry_after >= 1

    other = uuid4()
    consume_user(db, other, "probe", limit=3, window_seconds=60)


def test_user_limit_is_off_when_disabled(db: Session):
    user_id = uuid4()
    for _ in range(8):
        consume_user(db, user_id, "probe", limit=2, window_seconds=60)


def test_enforce_raises_http_429(db: Session, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.rate_limit_service._enabled", lambda: True)
    user_id = uuid4()
    enforce_user_limit(db, user_id, "probe", limit=1, window_seconds=60)
    with pytest.raises(HTTPException) as error:
        enforce_user_limit(db, user_id, "probe", limit=1, window_seconds=60)
    assert error.value.status_code == 429
    assert error.value.headers is not None
    assert error.value.headers.get("Retry-After")

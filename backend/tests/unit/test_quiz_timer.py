from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from app.services.quiz_service import remaining_seconds

NOW = datetime(2026, 8, 12, 20, 0, tzinfo=UTC)


def test_remaining_is_full_before_clock_starts():
    session = SimpleNamespace(filters={"timer_seconds": 15})
    assert remaining_seconds(session, uuid4()) == 15


@patch("app.services.quiz_service.datetime", wraps=datetime)
def test_remaining_keeps_whole_seconds_elapsed(mock_dt):
    mock_dt.now.return_value = NOW
    question_id = uuid4()
    started = (NOW - timedelta(seconds=8, milliseconds=200)).isoformat()
    session = SimpleNamespace(
        filters={"timer_seconds": 15, "presented_at": {str(question_id): started}}
    )
    assert remaining_seconds(session, question_id) == 7


@patch("app.services.quiz_service.datetime", wraps=datetime)
def test_remaining_floors_at_zero(mock_dt):
    mock_dt.now.return_value = NOW
    question_id = uuid4()
    started = (NOW - timedelta(seconds=40)).isoformat()
    session = SimpleNamespace(
        filters={"timer_seconds": 15, "presented_at": {str(question_id): started}}
    )
    assert remaining_seconds(session, question_id) == 0


def test_no_timer_returns_none():
    session = SimpleNamespace(filters={})
    assert remaining_seconds(session, uuid4()) is None

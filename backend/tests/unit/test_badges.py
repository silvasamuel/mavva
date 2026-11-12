"""Wisdom levels and contributor tiers: the thresholds behind the seals."""

import pytest

from app.models.enums import Difficulty
from app.services.badges import (
    WISDOM_MAX_LEVEL,
    WISDOM_POINTS,
    WISDOM_THRESHOLDS,
    contributor_payload,
    contributor_tier,
    wisdom_level,
    wisdom_payload,
)


@pytest.mark.parametrize(
    ("points", "level"),
    [
        (0, 1),
        (14, 1),
        (15, 2),
        (44, 2),
        (45, 3),
        (199, 4),
        (200, 5),
        (1799, 9),
        (1800, 10),
        (99_999, 10),
    ],
)
def test_wisdom_level_steps(points: int, level: int) -> None:
    assert wisdom_level(points) == level


def test_wisdom_goes_from_one_to_ten() -> None:
    assert WISDOM_MAX_LEVEL == 10
    assert WISDOM_THRESHOLDS[0] == 0
    assert list(WISDOM_THRESHOLDS) == sorted(set(WISDOM_THRESHOLDS))


def test_harder_questions_teach_more() -> None:
    assert WISDOM_POINTS[Difficulty.EASY] == 0
    assert (
        WISDOM_POINTS[Difficulty.MEDIUM]
        < WISDOM_POINTS[Difficulty.HARD]
        < WISDOM_POINTS[Difficulty.EXPERT]
    )


def test_wisdom_payload_shows_the_way_to_the_next_level() -> None:
    assert wisdom_payload(60) == {
        "level": 3,
        "max_level": 10,
        "points": 60,
        "level_floor": 45,
        "next_level_at": 100,
    }
    top = wisdom_payload(5000)
    assert top["level"] == 10
    assert top["next_level_at"] is None


@pytest.mark.parametrize(
    ("count", "tier"),
    [
        (0, None),
        (1, "bronze"),
        (4, "bronze"),
        (5, "silver"),
        (14, "silver"),
        (15, "gold"),
        (39, "gold"),
        (40, "diamond"),
        (500, "diamond"),
    ],
)
def test_contributor_tiers(count: int, tier: str | None) -> None:
    assert contributor_tier(count) == tier


def test_contributor_payload_names_the_next_tier() -> None:
    assert contributor_payload(0) == {
        "tier": None,
        "contributions": 0,
        "next_tier": "bronze",
        "next_tier_at": 1,
    }
    assert contributor_payload(7) == {
        "tier": "silver",
        "contributions": 7,
        "next_tier": "gold",
        "next_tier_at": 15,
    }
    assert contributor_payload(40)["next_tier"] is None

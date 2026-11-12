"""Wisdom and contributor standing: the two earned seals next to a player's rank.

Both are lifetime (seasons never reset them) and kept as plain counters on
`user_stats`, so lists such as the ranking read them without extra queries.
"""

from typing import Any

from app.models import User
from app.models.enums import Difficulty

# Wisdom is a map of what the player knows *now*: every question counts by the
# player's latest answer to it. Right adds the gain, wrong takes the loss, and
# a question never answered counts for nothing. So it moves both ways: missing
# something once known costs its gain plus the loss, and getting it right
# again wins all of that back. Easy questions add nothing (wisdom is about the
# hard ones) but missing one still costs.
WISDOM_GAIN: dict[Difficulty, int] = {
    Difficulty.EASY: 0,
    Difficulty.MEDIUM: 1,
    Difficulty.HARD: 3,
    Difficulty.EXPERT: 5,
}
WISDOM_LOSS: dict[Difficulty, int] = {
    Difficulty.EASY: 1,
    Difficulty.MEDIUM: 1,
    Difficulty.HARD: 2,
    Difficulty.EXPERT: 3,
}
# Points needed to *be* at level 1, 2, … 10. The steps widen so the last
# levels ask for a large share of the hard and expert bank.
WISDOM_THRESHOLDS: tuple[int, ...] = (0, 15, 45, 100, 200, 350, 550, 850, 1250, 1800)
WISDOM_MAX_LEVEL = len(WISDOM_THRESHOLDS)

# Contributor: accepted contributions (resolved reports, approved questions,
# accepted app suggestions) needed for each tier, lowest first.
CONTRIBUTOR_TIERS: tuple[tuple[str, int], ...] = (
    ("bronze", 1),
    ("silver", 5),
    ("gold", 15),
    ("diamond", 40),
)


def wisdom_value(difficulty: Difficulty, is_correct: bool | None) -> int:
    """What one question is worth given the latest answer to it (None = never)."""
    if is_correct is None:
        return 0
    return WISDOM_GAIN[difficulty] if is_correct else -WISDOM_LOSS[difficulty]


def wisdom_delta(difficulty: Difficulty, previous: bool | None, is_correct: bool) -> int:
    """How much an answer moves the total, given the answer it replaces."""
    return wisdom_value(difficulty, is_correct) - wisdom_value(difficulty, previous)


def wisdom_level(points: int) -> int:
    """1 to 10. The total can dip below zero after early misses: still level 1."""
    level = 1
    for index, threshold in enumerate(WISDOM_THRESHOLDS, start=1):
        if points >= threshold:
            level = index
    return level


def wisdom_payload(points: int) -> dict[str, int | None]:
    """Level plus where the player stands inside it (own profile only).

    `points` is the real total, negative included, so "how far to the next
    level" stays honest for someone who has to climb out of early misses.
    """
    level = wisdom_level(points)
    return {
        "level": level,
        "max_level": WISDOM_MAX_LEVEL,
        "points": points,
        "level_floor": WISDOM_THRESHOLDS[level - 1],
        "next_level_at": WISDOM_THRESHOLDS[level] if level < WISDOM_MAX_LEVEL else None,
    }


def contributor_tier(contributions: int) -> str | None:
    tier: str | None = None
    for code, minimum in CONTRIBUTOR_TIERS:
        if contributions >= minimum:
            tier = code
    return tier


def contributor_payload(contributions: int) -> dict[str, Any]:
    upcoming = next(
        ((code, minimum) for code, minimum in CONTRIBUTOR_TIERS if contributions < minimum), None
    )
    return {
        "tier": contributor_tier(contributions),
        "contributions": contributions,
        "next_tier": upcoming[0] if upcoming else None,
        "next_tier_at": upcoming[1] if upcoming else None,
    }


def public_badges(user: User) -> dict[str, Any]:
    """The three seals as other players see them: levels and tiers, no progress."""
    stats = user.stats
    return {
        "wisdom_level": wisdom_level(stats.wisdom_points if stats else 0),
        "contributor_tier": contributor_tier(stats.contributions if stats else 0),
        "is_supporter": user.is_supporter,
        # Shown on the seal ("2" = second month of support); nothing to show
        # while the seal itself is off.
        "supporter_months": user.supporter_months if user.is_supporter else 0,
    }

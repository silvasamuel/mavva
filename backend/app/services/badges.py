"""Wisdom and contributor standing: the two earned seals next to a player's rank.

Both are lifetime (seasons never reset them) and kept as plain counters on
`user_stats`, so lists such as the ranking read them without extra queries.
"""

from typing import Any

from app.models import User
from app.models.enums import Difficulty

# Wisdom: points for the first correct answer to each question, by difficulty.
# Easy questions pay nothing: wisdom is about the hard ones.
WISDOM_POINTS: dict[Difficulty, int] = {
    Difficulty.EASY: 0,
    Difficulty.MEDIUM: 1,
    Difficulty.HARD: 3,
    Difficulty.EXPERT: 5,
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


def wisdom_level(points: int) -> int:
    level = 1
    for index, threshold in enumerate(WISDOM_THRESHOLDS, start=1):
        if points >= threshold:
            level = index
    return level


def wisdom_payload(points: int) -> dict[str, int | None]:
    """Level plus where the player stands inside it (own profile only)."""
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

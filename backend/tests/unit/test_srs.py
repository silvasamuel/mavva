from datetime import date, timedelta

from app.models import ReviewItem
from app.models.enums import ReviewSpacing
from app.services.srs import (
    EASE_MIN,
    EASE_START,
    PREVIEW_HITS,
    ReviewSettings,
    apply_review,
    spacing_preview,
)

TODAY = date(2026, 7, 14)


def _item() -> ReviewItem:
    return ReviewItem(
        repetitions=0, ease_factor=EASE_START, interval_days=1, due_date=TODAY, lapses=0
    )


class TestSm2:
    def test_first_correct_review_due_tomorrow(self):
        item = apply_review(_item(), True, TODAY)
        assert item.interval_days == 1
        assert item.due_date == TODAY + timedelta(days=1)

    def test_second_correct_review_due_in_three_days(self):
        item = apply_review(apply_review(_item(), True, TODAY), True, TODAY)
        assert item.interval_days == 3

    def test_third_correct_review_multiplies_by_ease(self):
        # ease starts at 2.5 and gains 0.05 per hit: 1d -> 3d -> round(3 * 2.6) = 8d
        item = _item()
        for _ in range(3):
            item = apply_review(item, True, TODAY)
        assert item.interval_days == 8

    def test_intervals_grow_monotonically(self):
        item = _item()
        intervals = []
        for _ in range(6):
            item = apply_review(item, True, TODAY)
            intervals.append(item.interval_days)
        assert intervals == sorted(intervals)

    def test_wrong_answer_resets_interval_and_counts_lapse(self):
        item = _item()
        for _ in range(4):
            item = apply_review(item, True, TODAY)
        item = apply_review(item, False, TODAY)
        assert item.interval_days == 1
        assert item.repetitions == 0
        assert item.lapses == 1
        assert item.due_date == TODAY + timedelta(days=1)

    def test_ease_factor_never_drops_below_floor(self):
        item = _item()
        for _ in range(20):
            item = apply_review(item, False, TODAY)
        assert item.ease_factor >= EASE_MIN

    def test_intensive_spacing_grows_more_slowly(self):
        item = _item()
        settings = ReviewSettings(spacing=ReviewSpacing.INTENSIVE)
        item = apply_review(item, True, TODAY, settings)
        assert item.interval_days == 1
        item = apply_review(item, True, TODAY, settings)
        assert item.interval_days == 2

    def test_relaxed_spacing_starts_further_out(self):
        item = apply_review(_item(), True, TODAY, ReviewSettings(spacing=ReviewSpacing.RELAXED))
        assert item.interval_days == 3
        item = apply_review(item, True, TODAY, ReviewSettings(spacing=ReviewSpacing.RELAXED))
        assert item.interval_days == 7

    def test_max_interval_caps_growth(self):
        item = _item()
        settings = ReviewSettings(max_interval_days=30)
        for _ in range(8):
            item = apply_review(item, True, TODAY, settings)
        assert item.interval_days == 30


class TestSpacingPreview:
    """The review screen explains each spacing with these numbers, so they must
    be exactly what the scheduler does — not a copy that can drift."""

    def test_matches_the_scheduler_for_every_option(self):
        preview = spacing_preview(ReviewSettings())
        assert preview == {
            "intensive": [1, 2, 3, 4, 6],
            "balanced": [1, 3, 8, 21, 57],
            "relaxed": [3, 7, 18, 48, 130],
        }

    def test_agrees_with_applying_reviews_one_by_one(self):
        for spacing in ReviewSpacing:
            item = _item()
            expected = []
            for _ in range(PREVIEW_HITS):
                item = apply_review(item, True, TODAY, ReviewSettings(spacing=spacing))
                expected.append(item.interval_days)
            assert spacing_preview(ReviewSettings())[spacing.value] == expected

    def test_applies_the_max_interval(self):
        preview = spacing_preview(ReviewSettings(max_interval_days=30))
        assert preview["balanced"] == [1, 3, 8, 21, 30]
        assert preview["relaxed"] == [3, 7, 18, 30, 30]
        assert max(max(steps) for steps in preview.values()) <= 30

    def test_ignores_the_selected_spacing(self):
        # Every option is previewed so the player can compare before switching.
        assert spacing_preview(ReviewSettings(spacing=ReviewSpacing.RELAXED)) == spacing_preview(
            ReviewSettings(spacing=ReviewSpacing.INTENSIVE)
        )

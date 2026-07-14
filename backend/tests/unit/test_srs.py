from datetime import date, timedelta

from app.models import ReviewItem
from app.services.srs import EASE_MIN, EASE_START, apply_review

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

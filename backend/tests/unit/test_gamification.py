from datetime import date

from app.models import UserStats
from app.models.enums import Difficulty
from app.services.gamification import (
    effective_streak,
    level_from_total_xp,
    register_streak_activity,
    xp_for_answer,
    xp_to_advance,
)


class TestXp:
    def test_correct_answer_scales_with_difficulty(self):
        assert xp_for_answer(Difficulty.EASY, True) == 10
        assert xp_for_answer(Difficulty.MEDIUM, True) == 20
        assert xp_for_answer(Difficulty.HARD, True) == 35
        assert xp_for_answer(Difficulty.EXPERT, True) == 50

    def test_wrong_answer_costs_half_the_question_value(self):
        assert xp_for_answer(Difficulty.EASY, False) == -5
        assert xp_for_answer(Difficulty.MEDIUM, False) == -10
        assert xp_for_answer(Difficulty.HARD, False) == -17
        assert xp_for_answer(Difficulty.EXPERT, False) == -25

    def test_more_errors_than_hits_yields_negative_balance(self):
        # 3 easy hits (+30) against 4 easy misses (-20)... still positive;
        # but misses outweighing hits at the same value tips negative: 3 hits, 7 misses.
        balance = 3 * xp_for_answer(Difficulty.EASY, True) + 7 * xp_for_answer(
            Difficulty.EASY, False
        )
        assert balance < 0


class TestLevelCurve:
    def test_cost_grows_50_per_level(self):
        assert xp_to_advance(1) == 100
        assert xp_to_advance(2) == 150
        assert xp_to_advance(3) == 200

    def test_level_from_total_xp(self):
        assert level_from_total_xp(0) == (1, 0, 100)
        assert level_from_total_xp(99) == (1, 99, 100)
        assert level_from_total_xp(100) == (2, 0, 150)
        assert level_from_total_xp(250) == (3, 0, 200)
        assert level_from_total_xp(260) == (3, 10, 200)


class TestStreak:
    def _stats(self, streak: int = 0, last: date | None = None) -> UserStats:
        return UserStats(current_streak=streak, longest_streak=streak, last_activity_date=last)

    def test_first_activity_starts_streak(self):
        stats = self._stats()
        update = register_streak_activity(stats, date(2026, 7, 14))
        assert update.current == 1
        assert update.extended_today is True

    def test_same_day_does_not_double_count(self):
        stats = self._stats(streak=5, last=date(2026, 7, 14))
        update = register_streak_activity(stats, date(2026, 7, 14))
        assert update.current == 5
        assert update.extended_today is False

    def test_consecutive_day_extends(self):
        stats = self._stats(streak=5, last=date(2026, 7, 13))
        update = register_streak_activity(stats, date(2026, 7, 14))
        assert update.current == 6

    def test_gap_resets_to_one(self):
        stats = self._stats(streak=30, last=date(2026, 7, 10))
        update = register_streak_activity(stats, date(2026, 7, 14))
        assert update.current == 1

    def test_longest_streak_is_preserved(self):
        stats = self._stats(streak=30, last=date(2026, 7, 10))
        register_streak_activity(stats, date(2026, 7, 14))
        assert stats.longest_streak == 30

    def test_month_boundary(self):
        stats = self._stats(streak=3, last=date(2026, 6, 30))
        update = register_streak_activity(stats, date(2026, 7, 1))
        assert update.current == 4

    def test_effective_streak_zeroes_after_gap(self):
        stats = self._stats(streak=10, last=date(2026, 7, 10))
        assert effective_streak(stats, date(2026, 7, 14)) == 0

    def test_effective_streak_survives_yesterday(self):
        stats = self._stats(streak=10, last=date(2026, 7, 13))
        assert effective_streak(stats, date(2026, 7, 14)) == 10

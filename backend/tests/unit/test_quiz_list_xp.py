from types import SimpleNamespace

from app.models.enums import Difficulty, QuizMode
from app.services.quiz_service import list_xp


def _session(
    *,
    correct: list[Difficulty],
    wrong: list[Difficulty],
    complete: bool = True,
    mode: QuizMode = QuizMode.PRACTICE,
    xp_earned: int = 0,
) -> SimpleNamespace:
    answers = [
        SimpleNamespace(is_correct=True, question=SimpleNamespace(difficulty=d)) for d in correct
    ] + [SimpleNamespace(is_correct=False, question=SimpleNamespace(difficulty=d)) for d in wrong]
    return SimpleNamespace(
        mode=mode,
        answers=answers,
        question_count=len(answers) if complete else len(answers) + 1,
        correct_count=len(correct),
        xp_earned=xp_earned,
    )


class TestListXp:
    def test_study_nets_hits_minus_misses(self):
        # +20 and -10, plus the +5 completion bonus → 15.
        session = _session(correct=[Difficulty.MEDIUM], wrong=[Difficulty.MEDIUM])
        assert list_xp(session) == 15

    def test_equal_hits_and_misses_net_to_zero_without_bonus(self):
        # +20 and -20 (two medium misses), no completion bonus (not all answered).
        session = _session(
            correct=[Difficulty.MEDIUM],
            wrong=[Difficulty.MEDIUM, Difficulty.MEDIUM],
            complete=False,
        )
        assert list_xp(session) == 0

    def test_shows_net_loss_when_misses_outweigh_hits(self):
        # +10 and -25, plus +5 completion → -10.
        session = _session(correct=[Difficulty.EASY], wrong=[Difficulty.EXPERT])
        assert list_xp(session) == -10

    def test_duel_uses_stored_xp_not_per_answer(self):
        session = _session(
            correct=[Difficulty.HARD],
            wrong=[Difficulty.EASY],
            mode=QuizMode.DUEL,
            xp_earned=0,
        )
        assert list_xp(session) == 0

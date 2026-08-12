from types import SimpleNamespace

from app.models.enums import Difficulty, QuizMode
from app.services.quiz_service import list_xp


def _session(
    *,
    correct: list[Difficulty],
    wrong: list[Difficulty],
    complete: bool = True,
) -> SimpleNamespace:
    answers = [
        SimpleNamespace(is_correct=True, question=SimpleNamespace(difficulty=d)) for d in correct
    ] + [SimpleNamespace(is_correct=False, question=SimpleNamespace(difficulty=d)) for d in wrong]
    return SimpleNamespace(
        mode=QuizMode.PRACTICE,
        answers=answers,
        question_count=len(answers) if complete else len(answers) + 1,
        correct_count=len(correct),
        xp_earned=0,
    )


class TestListXp:
    def test_shows_gains_when_they_cover_losses(self):
        # +20 and -10, plus the +5 completion bonus → gains 25, losses 10.
        session = _session(correct=[Difficulty.MEDIUM], wrong=[Difficulty.MEDIUM])
        assert list_xp(session) == 25

    def test_equal_gains_and_losses_still_show_the_gain(self):
        # +20 and -20 (two medium misses), no completion bonus (not all answered).
        session = _session(
            correct=[Difficulty.MEDIUM],
            wrong=[Difficulty.MEDIUM, Difficulty.MEDIUM],
            complete=False,
        )
        assert list_xp(session) == 20

    def test_shows_net_loss_when_misses_outweigh_hits(self):
        # +10 and -25, plus +5 completion → gains 15, losses 25 → -10.
        session = _session(correct=[Difficulty.EASY], wrong=[Difficulty.EXPERT])
        assert list_xp(session) == -10

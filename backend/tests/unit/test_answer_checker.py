from app.services.answer_checker import is_answer_correct, normalize


class TestNormalize:
    def test_strips_accents_and_case(self):
        assert normalize("  MelquisedequE ") == "melquisedeque"
        assert normalize("São Paulo") == "sao paulo"

    def test_removes_punctuation_and_extra_spaces(self):
        assert normalize("Jesus,   Cristo!") == "jesus cristo"


class TestIsAnswerCorrect:
    def test_exact_match(self):
        assert is_answer_correct("Abigail", ["Abigail"])

    def test_accent_and_case_variations(self):
        assert is_answer_correct("melquisedeque", ["Melquisedeque"])
        assert is_answer_correct("JERUSALEM", ["Jerusalém"])

    def test_accepts_any_listed_variation(self):
        assert is_answer_correct("Cefas", ["Pedro", "Simão Pedro", "Cefas"])

    def test_small_typo_is_tolerated(self):
        assert is_answer_correct("Melquisedequi", ["Melquisedeque"])

    def test_short_answers_do_not_fuzzy_match(self):
        # "Caim" must not match "Cão" nor other short words.
        assert not is_answer_correct("Caim", ["Cão"])
        assert not is_answer_correct("Set", ["Sem"])

    def test_wrong_answer_rejected(self):
        assert not is_answer_correct("Davi", ["Salomão"])

    def test_empty_answer_rejected(self):
        assert not is_answer_correct("   ", ["Salomão"])

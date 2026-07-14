"""Open-answer matching: tolerates accents, casing, punctuation and small typos."""

import re
import unicodedata

from rapidfuzz import fuzz


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.strip().lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")  # strip accents
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def is_answer_correct(user_answer: str, accepted: list[str]) -> bool:
    normalized_user = normalize(user_answer)
    if not normalized_user:
        return False
    for candidate in accepted:
        normalized_candidate = normalize(candidate)
        if normalized_user == normalized_candidate:
            return True
        # Typo tolerance, stricter for short answers (avoids "Caim" matching "Cão")
        is_long_enough = len(normalized_candidate) >= 5
        if is_long_enough and fuzz.ratio(normalized_user, normalized_candidate) >= 90:
            return True
    return False

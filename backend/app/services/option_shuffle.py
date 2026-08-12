"""Deterministic per-session shuffling of multiple-choice options.

Content files store the correct option first, so serving options in stored
order would let anyone calling the API straight (bypassing the UI) win by
always picking the first one — which matters most in duels, where XP is at
stake. Shuffling here, on the server, closes that: the order is random per
session but stable across reloads, so answers never jump mid-question.
"""

import hashlib
import random
import uuid


def shuffled_for[T](items: list[T], session_id: uuid.UUID, question_id: uuid.UUID) -> list[T]:
    seed = hashlib.sha256(f"{session_id}:{question_id}".encode()).digest()
    rng = random.Random(int.from_bytes(seed[:8], "big"))
    result = list(items)
    rng.shuffle(result)
    return result

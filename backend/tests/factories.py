"""Minimal data builders for API tests."""

import itertools

from sqlalchemy.orm import Session

from app.models import Category, Question, QuestionOption
from app.models.enums import Difficulty, Testament

_counter = itertools.count(1)


def make_category(db: Session, slug: str = "personagens") -> Category:
    category = Category(slug=slug, name=slug.title(), icon="👤", display_order=0)
    db.add(category)
    db.flush()
    return category


def make_mc_question(
    db: Session,
    category: Category,
    *,
    difficulty: Difficulty = Difficulty.MEDIUM,
    testament: Testament = Testament.OLD,
) -> Question:
    n = next(_counter)
    question = Question(
        external_id=f"{category.slug}-{n:04d}",
        text=f"Pergunta de múltipla escolha número {n}?",
        explanation="Explicação da pergunta com contexto bíblico.",
        testament=testament,
        book="genesis" if testament == Testament.OLD else "mateus",
        chapter=1,
        verse_start=1,
        difficulty=difficulty,
        category=category,
    )
    question.options = [
        QuestionOption(text="Alternativa correta", is_correct=True, position=0),
        QuestionOption(text="Alternativa B", is_correct=False, position=1),
        QuestionOption(text="Alternativa C", is_correct=False, position=2),
        QuestionOption(text="Alternativa D", is_correct=False, position=3),
    ]
    db.add(question)
    db.flush()
    return question

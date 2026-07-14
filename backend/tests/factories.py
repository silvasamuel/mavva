"""Minimal data builders for API tests."""

import itertools

from sqlalchemy.orm import Session

from app.models import Category, Question, QuestionAnswer, QuestionOption
from app.models.enums import Difficulty, QuestionType, Testament

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
        type=QuestionType.MULTIPLE_CHOICE,
        text=f"Pergunta de múltipla escolha número {n}?",
        explanation="Explicação da pergunta com contexto bíblico.",
        testament=testament,
        book="genesis" if testament == Testament.OLD else "mateus",
        chapter=1,
        verse_start=1,
        theme="Fé",
        difficulty=difficulty,
        category=category,
        tags=["teste"],
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


def make_open_question(
    db: Session, category: Category, *, difficulty: Difficulty = Difficulty.MEDIUM
) -> Question:
    n = next(_counter)
    question = Question(
        external_id=f"{category.slug}-{n:04d}",
        type=QuestionType.OPEN_ANSWER,
        text=f"Pergunta aberta número {n}: qual é a resposta?",
        explanation="Explicação da pergunta aberta.",
        testament=Testament.NEW,
        book="joao",
        chapter=3,
        verse_start=16,
        theme="Amor de Deus",
        difficulty=difficulty,
        category=category,
        tags=["teste"],
    )
    question.accepted_answers = [
        QuestionAnswer(text="Jesus Cristo", position=0),
        QuestionAnswer(text="Jesus", position=1),
    ]
    db.add(question)
    db.flush()
    return question

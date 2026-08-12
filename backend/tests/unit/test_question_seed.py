from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Question
from app.seeds.questions import seed_questions
from app.services import content_sync
from tests.factories import make_category, make_mc_question, make_open_question


def _write_bank(db: Session, content_dir: Path, category_id: int) -> None:
    from app.models import Category

    category = db.get(Category, category_id)
    assert category is not None
    data = content_sync.serialize_category(db, category)
    assert data is not None
    questions_dir = content_dir / "questions"
    questions_dir.mkdir(parents=True)
    (questions_dir / f"{category.slug}.json").write_text(
        content_sync.render_file(data), encoding="utf-8"
    )


def test_reseed_keeps_option_ids(db: Session, tmp_path: Path):
    category = make_category(db)
    question = make_mc_question(db, category)
    original_ids = [option.id for option in question.options]
    _write_bank(db, tmp_path, category.id)

    created, updated = seed_questions(db, tmp_path, {category.slug: category.id})
    db.flush()

    assert created == 0
    assert updated == 1
    reloaded = db.scalar(
        select(Question).where(Question.id == question.id).options(selectinload(Question.options))
    )
    assert reloaded is not None
    assert [option.id for option in reloaded.options] == original_ids


def test_reseed_updates_option_text_without_new_id(db: Session, tmp_path: Path):
    category = make_category(db)
    question = make_mc_question(db, category)
    option_id = question.options[1].id
    _write_bank(db, tmp_path, category.id)
    bank = tmp_path / "questions" / f"{category.slug}.json"
    bank.write_text(bank.read_text(encoding="utf-8").replace("Alternativa B", "Nova B"))

    seed_questions(db, tmp_path, {category.slug: category.id})
    db.flush()
    db.expire(question)

    updated = next(option for option in question.options if option.position == 1)
    assert updated.id == option_id
    assert updated.text == "Nova B"


def test_reseed_keeps_accepted_answer_rows(db: Session, tmp_path: Path):
    category = make_category(db)
    question = make_open_question(db, category)
    original_ids = [answer.id for answer in question.accepted_answers]
    _write_bank(db, tmp_path, category.id)

    seed_questions(db, tmp_path, {category.slug: category.id})
    db.flush()
    db.expire(question)
    assert [answer.id for answer in question.accepted_answers] == original_ids

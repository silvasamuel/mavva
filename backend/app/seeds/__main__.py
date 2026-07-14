"""Run all seeds: `python -m app.seeds` (or `--validate-only` for CI content checks)."""

import sys

from app.core.config import get_settings
from app.seeds.achievements import seed_achievements
from app.seeds.categories import seed_categories
from app.seeds.questions import load_content_files, seed_questions


def main() -> int:
    settings = get_settings()

    if "--validate-only" in sys.argv:
        files = load_content_files(settings.content_dir)
        total = sum(len(f.questions) for f in files)
        print(f"OK: {len(files)} arquivos, {total} perguntas válidas")
        return 0

    from app.db.session import SessionLocal

    with SessionLocal() as db:
        category_ids = seed_categories(db)
        seed_achievements(db)
        created, updated = seed_questions(db, settings.content_dir, category_ids)
        db.commit()
    print(f"Seed concluído: {created} perguntas criadas, {updated} atualizadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

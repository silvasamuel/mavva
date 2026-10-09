"""Runs the tutorial migration against the test schema (inside the rolled-back
test transaction) to pin the backfill: existing players skip the tutorial,
new sign-ups get it."""

import importlib.util
from pathlib import Path
from types import ModuleType

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import User

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "20261009_1030_add_user_tutorial_completed.py"
)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("tutorial_migration", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_user(db: Session, handle: str) -> User:
    user = User(email=f"{handle}@teste.com", username=handle, name="Jogador", hashed_password="x")
    db.add(user)
    db.flush()
    return user


def test_upgrade_backfills_existing_users_and_new_ones_start_null(db: Session):
    migration = _load_migration()
    assert migration.revision == "c1d2e3f4a5b6"
    assert migration.down_revision == "b0c1d2e3f4a5"

    veteran = _make_user(db, "veterano")
    assert veteran.tutorial_completed_at is None

    connection = db.connection()
    with Operations.context(MigrationContext.configure(connection)):
        migration.downgrade()
        migration.upgrade()

    db.refresh(veteran)
    assert veteran.tutorial_completed_at is not None
    assert veteran.tutorial_completed is True

    column = connection.execute(
        text(
            "SELECT is_nullable, column_default, data_type FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'tutorial_completed_at'"
        )
    ).one()
    assert column.is_nullable == "YES"
    assert column.column_default is None
    assert column.data_type == "timestamp with time zone"

    newcomer = _make_user(db, "novato")
    stored = connection.scalar(
        text("SELECT tutorial_completed_at FROM users WHERE id = :id"), {"id": newcomer.id}
    )
    assert stored is None
    assert newcomer.tutorial_completed is False

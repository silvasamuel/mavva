"""add cancelled duel status

Revision ID: ee37af7a221c
Revises: dd3684553307
Create Date: 2026-08-12 16:45:06.956374

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "ee37af7a221c"
down_revision: str | None = "dd3684553307"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE duel_status ADD VALUE IF NOT EXISTS 'cancelled'")


def downgrade() -> None:
    # Postgres cannot drop a single enum value; the extra label is harmless.
    pass

"""add season notice tracking to users

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-10-10 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: str | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # No backfill: everyone already here sees the first season's welcome once.
    op.add_column("users", sa.Column("season_start_seen", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("season_end_seen", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "season_end_seen")
    op.drop_column("users", "season_start_seen")

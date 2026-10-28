"""remember which season-champion celebration a player has seen

Revision ID: a5b6c7d8e9f0
Revises: e3f4a5b6c7d8
Create Date: 2026-10-28 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: str | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("champion_seen_season", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "champion_seen_season")

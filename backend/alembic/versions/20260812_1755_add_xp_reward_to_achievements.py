"""add xp reward to achievements

Revision ID: a1b2c3d4e5f6
Revises: ee37af7a221c
Create Date: 2026-08-12 17:55:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "ee37af7a221c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "achievements",
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("achievements", "xp_reward", server_default=None)


def downgrade() -> None:
    op.drop_column("achievements", "xp_reward")

"""what each session did to the player's wisdom: quiz_sessions.wisdom_delta

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-11 13:00:00.000000

Only reported on the summary screen right after a session ends, so past
sessions simply start at zero.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "quiz_sessions",
        sa.Column("wisdom_delta", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("quiz_sessions", "wisdom_delta")

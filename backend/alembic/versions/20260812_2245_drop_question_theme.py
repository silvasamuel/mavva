"""drop unused question theme, subcategory, and tags

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-08-12 22:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("questions", "theme")
    op.drop_column("questions", "subcategory")
    op.drop_column("questions", "tags")


def downgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String(length=40)),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "questions",
        sa.Column("subcategory", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "questions",
        sa.Column("theme", sa.String(length=80), server_default="", nullable=False),
    )
    op.alter_column("questions", "theme", server_default=None)
    op.alter_column("questions", "tags", server_default=None)

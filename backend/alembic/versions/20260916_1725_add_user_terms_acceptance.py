"""add user terms acceptance

Revision ID: e4f5a6b7c8d9
Revises: f3a4b5c6d7e8
Create Date: 2026-09-16 17:25:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("terms_version", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")

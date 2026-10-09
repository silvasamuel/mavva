"""add user tutorial completion

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-10-09 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "b0c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("tutorial_completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    # The tutorial is for people who sign up from now on: everyone already here
    # knows the app, so they count as done and never see it.
    op.execute(sa.text("UPDATE users SET tutorial_completed_at = now()"))


def downgrade() -> None:
    op.drop_column("users", "tutorial_completed_at")

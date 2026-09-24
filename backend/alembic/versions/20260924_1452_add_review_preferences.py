"""add review preferences

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-09-24 14:52:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b0c1d2e3f4a5"
down_revision: str | None = "a9b0c1d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "review_spacing",
            sa.Enum("intensive", "balanced", "relaxed", name="review_spacing"),
            server_default=sa.text("'balanced'::review_spacing"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "review_scope",
            sa.Enum("all", "mistakes", name="review_scope"),
            server_default=sa.text("'all'::review_scope"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "review_order",
            sa.Enum("oldest", "lapses", name="review_order"),
            server_default=sa.text("'oldest'::review_order"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("review_session_size", sa.Integer(), server_default="10", nullable=False),
    )
    op.add_column("users", sa.Column("review_max_interval_days", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "review_max_interval_days")
    op.drop_column("users", "review_session_size")
    op.drop_column("users", "review_order")
    op.drop_column("users", "review_scope")
    op.drop_column("users", "review_spacing")
    op.execute("DROP TYPE IF EXISTS review_order")
    op.execute("DROP TYPE IF EXISTS review_scope")
    op.execute("DROP TYPE IF EXISTS review_spacing")

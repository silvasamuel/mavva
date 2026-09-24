"""add review preferences

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-09-24 14:52:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b0c1d2e3f4a5"
down_revision: str | None = "a9b0c1d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The enum has to exist before the column default casts to it. add_column
    # emits the DEFAULT in the same statement and does not create the type first.
    spacing = postgresql.ENUM(
        "intensive", "balanced", "relaxed", name="review_spacing", create_type=False
    )
    scope = postgresql.ENUM("all", "mistakes", name="review_scope", create_type=False)
    order = postgresql.ENUM("oldest", "lapses", name="review_order", create_type=False)
    spacing.create(op.get_bind(), checkfirst=True)
    scope.create(op.get_bind(), checkfirst=True)
    order.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "review_spacing",
            spacing,
            server_default=sa.text("'balanced'::review_spacing"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "review_scope",
            scope,
            server_default=sa.text("'all'::review_scope"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "review_order",
            order,
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

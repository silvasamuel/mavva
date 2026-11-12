"""months of support: users.supporter_days_total

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-11 11:00:00.000000

Backfilled from the approved donations (every R$ 30, or part of it, bought
30 days). Supporters from before the 30-day rule get at least the 30 days
they were granted then.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("supporter_days_total", sa.Integer(), server_default="0", nullable=False),
    )
    op.execute(
        """
        UPDATE users AS u
        SET supporter_days_total = bought.days
        FROM (
            SELECT user_id, SUM(CEIL(amount_cents / 3000.0) * 30)::int AS days
            FROM support_payments
            WHERE status::text = 'approved'
            GROUP BY user_id
        ) AS bought
        WHERE u.id = bought.user_id
        """
    )
    op.execute(
        "UPDATE users SET supporter_days_total = 30 "
        "WHERE supporter_since IS NOT NULL AND supporter_days_total < 30"
    )


def downgrade() -> None:
    op.drop_column("users", "supporter_days_total")

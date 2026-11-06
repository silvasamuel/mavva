"""supporter badge with an end date: users.supporter_until

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-11-06 15:00:00.000000

Every R$ 30 (or part of it) donated buys 30 days of badge. Players who
already donated get the first window counted from their first donation.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: str | None = "d8e9f0a1b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("supporter_until", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE users SET supporter_until = supporter_since + interval '30 days' "
        "WHERE supporter_since IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("users", "supporter_until")

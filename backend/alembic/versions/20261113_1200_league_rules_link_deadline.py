"""league rules chosen by the admin, invite link, 24h deadline per cup match

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-11-13 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "leagues", sa.Column("question_count", sa.Integer(), server_default="10", nullable=False)
    )
    op.add_column(
        "leagues", sa.Column("timer_seconds", sa.Integer(), server_default="20", nullable=False)
    )
    op.add_column("leagues", sa.Column("invite_code", sa.String(length=16), nullable=True))
    # Leagues created before the link existed get a code of their own.
    op.execute(
        "UPDATE leagues SET invite_code = substr(md5(random()::text || id::text), 1, 12) "
        "WHERE invite_code IS NULL"
    )
    op.alter_column("leagues", "invite_code", nullable=False)
    op.create_unique_constraint(op.f("uq_leagues_invite_code"), "leagues", ["invite_code"])
    op.add_column(
        "league_matches", sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True)
    )
    # Cup matches already waiting for both players start their 24 hours now.
    op.execute(
        "UPDATE league_matches SET deadline_at = now() + interval '24 hours' "
        "WHERE resolved_at IS NULL AND player_a_id IS NOT NULL AND player_b_id IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("league_matches", "deadline_at")
    op.drop_constraint(op.f("uq_leagues_invite_code"), "leagues", type_="unique")
    op.drop_column("leagues", "invite_code")
    op.drop_column("leagues", "timer_seconds")
    op.drop_column("leagues", "question_count")

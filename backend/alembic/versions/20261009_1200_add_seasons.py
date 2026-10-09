"""add seasons

Revision ID: d2e3f4a5b6c7
Revises: b0c1d2e3f4a5
Create Date: 2026-10-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | None = "b0c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "seasons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_seasons")),
        sa.UniqueConstraint("number", name=op.f("uq_seasons_number")),
    )
    op.create_table(
        "season_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("season_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("final_xp", sa.Integer(), nullable=False),
        sa.Column("final_level", sa.Integer(), nullable=False),
        sa.Column("rank_code", sa.String(length=20), nullable=False),
        sa.Column("position", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["season_id"],
            ["seasons.id"],
            name=op.f("fk_season_results_season_id_seasons"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_season_results_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_season_results")),
        sa.UniqueConstraint("season_id", "user_id", name=op.f("uq_season_results_season_id")),
    )
    op.create_index(op.f("ix_season_results_user_id"), "season_results", ["user_id"])

    op.add_column(
        "user_stats",
        sa.Column("best_level", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )
    op.add_column("user_stats", sa.Column("last_season_level", sa.Integer(), nullable=True))
    # Progress made before seasons existed still counts toward the best rank.
    op.execute("UPDATE user_stats SET best_level = level")


def downgrade() -> None:
    op.drop_column("user_stats", "last_season_level")
    op.drop_column("user_stats", "best_level")
    op.drop_index(op.f("ix_season_results_user_id"), table_name="season_results")
    op.drop_table("season_results")
    op.drop_table("seasons")

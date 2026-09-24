"""add app suggestions

Revision ID: a9b0c1d2e3f4
Revises: f7a8b9c0d1e2
Create Date: 2026-09-24 14:27:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_suggestions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("feature", "correction", name="app_suggestion_kind"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("open", "reviewed", name="app_suggestion_status"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_app_suggestions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_suggestions")),
    )
    op.create_index(op.f("ix_app_suggestions_status"), "app_suggestions", ["status"])
    op.create_index(op.f("ix_app_suggestions_user_id"), "app_suggestions", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_app_suggestions_user_id"), table_name="app_suggestions")
    op.drop_index(op.f("ix_app_suggestions_status"), table_name="app_suggestions")
    op.drop_table("app_suggestions")
    op.execute("DROP TYPE IF EXISTS app_suggestion_status")
    op.execute("DROP TYPE IF EXISTS app_suggestion_kind")

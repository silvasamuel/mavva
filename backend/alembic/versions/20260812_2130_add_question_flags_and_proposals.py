"""add question flags and proposals

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-08-12 21:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "question_flags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column(
            "reason",
            sa.Enum(
                "wrong_text",
                "wrong_answer",
                "wrong_reference",
                "other",
                name="question_flag_reason",
            ),
            nullable=False,
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("open", "resolved", "dismissed", name="question_flag_status"),
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
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_question_flags_question_id_questions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["quiz_sessions.id"],
            name=op.f("fk_question_flags_session_id_quiz_sessions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_question_flags_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_flags")),
        sa.UniqueConstraint("user_id", "question_id", name=op.f("uq_question_flags_user_id")),
    )
    op.create_index(op.f("ix_question_flags_question_id"), "question_flags", ["question_id"])
    op.create_index(op.f("ix_question_flags_status"), "question_flags", ["status"])
    op.create_index(op.f("ix_question_flags_user_id"), "question_flags", ["user_id"])

    op.create_table(
        "question_proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="question_proposal_status"),
            nullable=False,
        ),
        sa.Column("question_id", sa.Uuid(), nullable=True),
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
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_question_proposals_question_id_questions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_question_proposals_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_proposals")),
    )
    op.create_index(op.f("ix_question_proposals_status"), "question_proposals", ["status"])
    op.create_index(op.f("ix_question_proposals_user_id"), "question_proposals", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_question_proposals_user_id"), table_name="question_proposals")
    op.drop_index(op.f("ix_question_proposals_status"), table_name="question_proposals")
    op.drop_table("question_proposals")
    op.drop_index(op.f("ix_question_flags_user_id"), table_name="question_flags")
    op.drop_index(op.f("ix_question_flags_status"), table_name="question_flags")
    op.drop_index(op.f("ix_question_flags_question_id"), table_name="question_flags")
    op.drop_table("question_flags")
    op.execute("DROP TYPE IF EXISTS question_proposal_status")
    op.execute("DROP TYPE IF EXISTS question_flag_status")
    op.execute("DROP TYPE IF EXISTS question_flag_reason")

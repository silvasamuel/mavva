"""every question is multiple choice: drop the type and the open-answer leftovers

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-11-05 10:00:00.000000

The open-answer questions were rewritten as multiple choice in the content
bank; the seed that runs right after this migration gives them their options.
Until it does they have none, so they are deactivated here (the seed turns
them back on). The typed answers in quiz_answers.answer_text go with the
column: only the hit/miss ever mattered to stats, SRS and history.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | None = "b6c7d8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

QUESTION_TYPE = sa.Enum("multiple_choice", "open_answer", name="question_type")


def upgrade() -> None:
    op.execute("UPDATE questions SET is_active = false WHERE type = 'open_answer'")
    op.drop_column("questions", "type")
    QUESTION_TYPE.drop(op.get_bind())
    op.drop_table("question_answers")
    op.drop_column("quiz_answers", "answer_text")


def downgrade() -> None:
    op.add_column("quiz_answers", sa.Column("answer_text", sa.Text(), nullable=True))
    op.create_table(
        "question_answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.String(length=120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_question_answers_question_id_questions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_answers")),
    )
    op.create_index(op.f("ix_question_answers_question_id"), "question_answers", ["question_id"])
    QUESTION_TYPE.create(op.get_bind())
    op.add_column(
        "questions",
        sa.Column("type", QUESTION_TYPE, nullable=False, server_default="multiple_choice"),
    )
    op.alter_column("questions", "type", server_default=None)

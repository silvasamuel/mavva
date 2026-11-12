"""wisdom points and accepted contributions on user_stats; accepted suggestions

Revision ID: b2c3d4e5f6a7
Revises: f0a1b2c3d4e5
Create Date: 2026-11-11 10:00:00.000000

Both counters are backfilled from history: wisdom from the player's latest
answer to each question (right adds 1/3/5 for medium/hard/expert, wrong takes
1/1/2/3 from easy up), and contributions from resolved reports plus approved
question proposals. App suggestions only gain an "accepted" state now, so
past ones count for nothing.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "f0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Usable only after this transaction commits; nothing below writes it.
    op.execute("ALTER TYPE app_suggestion_status ADD VALUE IF NOT EXISTS 'accepted'")
    op.add_column(
        "user_stats", sa.Column("wisdom_points", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "user_stats", sa.Column("contributions", sa.Integer(), server_default="0", nullable=False)
    )
    # Each question counts by the player's latest answer to it: right adds
    # the gain, wrong takes the loss (see services/badges.py).
    op.execute(
        """
        UPDATE user_stats AS us
        SET wisdom_points = known.points
        FROM (
            SELECT latest.user_id,
                   SUM(CASE
                           WHEN latest.is_correct THEN
                               CASE q.difficulty::text
                                   WHEN 'medium' THEN 1
                                   WHEN 'hard' THEN 3
                                   WHEN 'expert' THEN 5
                                   ELSE 0
                               END
                           ELSE
                               CASE q.difficulty::text
                                   WHEN 'hard' THEN -2
                                   WHEN 'expert' THEN -3
                                   ELSE -1
                               END
                       END) AS points
            FROM (
                SELECT DISTINCT ON (qs.user_id, qa.question_id)
                       qs.user_id, qa.question_id, qa.is_correct
                FROM quiz_answers AS qa
                JOIN quiz_sessions AS qs ON qs.id = qa.session_id
                ORDER BY qs.user_id, qa.question_id, qa.answered_at DESC, qa.id DESC
            ) AS latest
            JOIN questions AS q ON q.id = latest.question_id
            GROUP BY latest.user_id
        ) AS known
        WHERE us.user_id = known.user_id
        """
    )
    op.execute(
        """
        UPDATE user_stats AS us
        SET contributions = accepted.total
        FROM (
            SELECT user_id, SUM(n) AS total
            FROM (
                SELECT user_id, COUNT(*) AS n
                FROM question_flags WHERE status::text = 'resolved' GROUP BY user_id
                UNION ALL
                SELECT user_id, COUNT(*) AS n
                FROM question_proposals WHERE status::text = 'approved' GROUP BY user_id
            ) AS parts
            GROUP BY user_id
        ) AS accepted
        WHERE us.user_id = accepted.user_id
        """
    )


def downgrade() -> None:
    # Postgres can't drop an enum value; fold accepted suggestions back into
    # "reviewed" and leave the unused label behind.
    op.execute("UPDATE app_suggestions SET status = 'reviewed' WHERE status::text = 'accepted'")
    op.drop_column("user_stats", "contributions")
    op.drop_column("user_stats", "wisdom_points")

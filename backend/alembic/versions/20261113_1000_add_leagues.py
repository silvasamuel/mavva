"""leagues: invite-only competitions (points table or knockout cup)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-13 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FORMAT = postgresql.ENUM("points", "cup", name="league_format", create_type=False)
STATUS = postgresql.ENUM(
    "recruiting", "active", "finished", "incomplete", name="league_status", create_type=False
)
MEMBER_STATUS = postgresql.ENUM(
    "invited", "active", "declined", "left", name="league_member_status", create_type=False
)


def _uuid(name: str, **kwargs):  # type: ignore[no-untyped-def]
    return sa.Column(name, sa.Uuid(), **kwargs)


def _ts(name: str, **kwargs):  # type: ignore[no-untyped-def]
    return sa.Column(name, sa.DateTime(timezone=True), **kwargs)


def upgrade() -> None:
    # A league round is its own kind of quiz session. The new label is only
    # used after this transaction commits; nothing below writes it.
    op.execute("ALTER TYPE quiz_mode ADD VALUE IF NOT EXISTS 'league'")
    bind = op.get_bind()
    FORMAT.create(bind, checkfirst=True)
    STATUS.create(bind, checkfirst=True)
    MEMBER_STATUS.create(bind, checkfirst=True)

    op.create_table(
        "leagues",
        _uuid("id", nullable=False),
        _uuid("owner_id", nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("format", FORMAT, nullable=False),
        sa.Column("status", STATUS, nullable=False),
        sa.Column("category_ids", postgresql.JSONB(), nullable=False),
        sa.Column("difficulties", postgresql.JSONB(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=True),
        _ts("ends_at", nullable=False),
        _ts("created_at", server_default=sa.text("now()"), nullable=False),
        _ts("started_at", nullable=True),
        _ts("finished_at", nullable=True),
        _uuid("champion_id", nullable=True),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_leagues_owner_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["champion_id"],
            ["users.id"],
            name=op.f("fk_leagues_champion_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_leagues")),
    )
    op.create_index(op.f("ix_leagues_owner_id"), "leagues", ["owner_id"])
    op.create_index("ix_leagues_status", "leagues", ["status"])

    op.create_table(
        "league_members",
        _uuid("id", nullable=False),
        _uuid("league_id", nullable=False),
        _uuid("user_id", nullable=False),
        sa.Column("status", MEMBER_STATUS, nullable=False),
        _ts("invited_at", server_default=sa.text("now()"), nullable=False),
        _ts("joined_at", nullable=True),
        sa.ForeignKeyConstraint(
            ["league_id"],
            ["leagues.id"],
            name=op.f("fk_league_members_league_id_leagues"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_league_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_league_members")),
        sa.UniqueConstraint("league_id", "user_id", name=op.f("uq_league_members_league_id")),
    )
    op.create_index(op.f("ix_league_members_league_id"), "league_members", ["league_id"])
    op.create_index("ix_league_members_user_status", "league_members", ["user_id", "status"])

    op.create_table(
        "league_matches",
        _uuid("id", nullable=False),
        _uuid("league_id", nullable=False),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("question_ids", postgresql.JSONB(), nullable=False),
        _uuid("player_a_id", nullable=True),
        _uuid("player_b_id", nullable=True),
        _uuid("feeder_a_id", nullable=True),
        _uuid("feeder_b_id", nullable=True),
        _uuid("winner_id", nullable=True),
        sa.Column("decided_by", sa.String(length=10), nullable=True),
        _ts("resolved_at", nullable=True),
        sa.ForeignKeyConstraint(
            ["league_id"],
            ["leagues.id"],
            name=op.f("fk_league_matches_league_id_leagues"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["player_a_id"],
            ["users.id"],
            name=op.f("fk_league_matches_player_a_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["player_b_id"],
            ["users.id"],
            name=op.f("fk_league_matches_player_b_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["winner_id"],
            ["users.id"],
            name=op.f("fk_league_matches_winner_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["feeder_a_id"],
            ["league_matches.id"],
            name=op.f("fk_league_matches_feeder_a_id_league_matches"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["feeder_b_id"],
            ["league_matches.id"],
            name=op.f("fk_league_matches_feeder_b_id_league_matches"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_league_matches")),
        sa.UniqueConstraint(
            "league_id", "round", "position", name=op.f("uq_league_matches_league_id")
        ),
    )
    op.create_index(op.f("ix_league_matches_league_id"), "league_matches", ["league_id"])

    op.create_table(
        "league_entries",
        _uuid("id", nullable=False),
        _uuid("match_id", nullable=False),
        _uuid("user_id", nullable=False),
        _uuid("session_id", nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("correct", sa.Integer(), nullable=False),
        sa.Column("time_seconds", sa.Integer(), nullable=False),
        _ts("finished_at", nullable=True),
        sa.ForeignKeyConstraint(
            ["match_id"],
            ["league_matches.id"],
            name=op.f("fk_league_entries_match_id_league_matches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_league_entries_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["quiz_sessions.id"],
            name=op.f("fk_league_entries_session_id_quiz_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_league_entries")),
        sa.UniqueConstraint("match_id", "user_id", name=op.f("uq_league_entries_match_id")),
        sa.UniqueConstraint("session_id", name=op.f("uq_league_entries_session_id")),
    )
    op.create_index(op.f("ix_league_entries_match_id"), "league_entries", ["match_id"])
    op.create_index(op.f("ix_league_entries_user_id"), "league_entries", ["user_id"])


def downgrade() -> None:
    op.drop_table("league_entries")
    op.drop_table("league_matches")
    op.drop_table("league_members")
    op.drop_table("leagues")
    bind = op.get_bind()
    MEMBER_STATUS.drop(bind, checkfirst=True)
    STATUS.drop(bind, checkfirst=True)
    FORMAT.drop(bind, checkfirst=True)
    # Postgres can't drop an enum label: quiz_mode keeps 'league', unused.
    op.execute("DELETE FROM quiz_sessions WHERE mode::text = 'league'")

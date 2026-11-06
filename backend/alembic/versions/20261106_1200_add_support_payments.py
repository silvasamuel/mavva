"""Pix donations: support_payments and users.supporter_since

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-11-06 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: str | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUS = postgresql.ENUM(
    "pending", "approved", "expired", "cancelled", name="support_payment_status", create_type=False
)


def upgrade() -> None:
    STATUS.create(op.get_bind(), checkfirst=True)
    op.add_column("users", sa.Column("supporter_since", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "support_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", STATUS, nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=64), nullable=False),
        sa.Column("qr_code", sa.Text(), nullable=False),
        sa.Column("ticket_url", sa.String(length=500), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_support_payments_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_payments")),
        sa.UniqueConstraint("provider_payment_id", name=op.f("uq_support_payments_provider_payment_id")),
    )
    op.create_index(op.f("ix_support_payments_user_id"), "support_payments", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_payments_user_id"), table_name="support_payments")
    op.drop_table("support_payments")
    op.drop_column("users", "supporter_since")
    STATUS.drop(op.get_bind(), checkfirst=True)

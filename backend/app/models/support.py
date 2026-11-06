import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import SupportPaymentStatus


class SupportPayment(TimestampMixin, Base):
    """A Pix charge issued for a donation ("Apoie o Mavva").

    The row is created together with the charge at the provider; the status
    then follows the provider's (webhook or polling) until it is final. The
    first approved one makes the player a supporter (users.supporter_since).
    """

    __tablename__ = "support_payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount_cents: Mapped[int]
    status: Mapped[SupportPaymentStatus] = mapped_column(
        Enum(
            SupportPaymentStatus,
            name="support_payment_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=SupportPaymentStatus.PENDING,
    )
    # "mercadopago" or "fake" (development without credentials).
    provider: Mapped[str] = mapped_column(String(20))
    provider_payment_id: Mapped[str] = mapped_column(String(64), unique=True)
    # Pix "copia e cola" payload; the QR code is rendered from it.
    qr_code: Mapped[str] = mapped_column(Text)
    ticket_url: Mapped[str | None] = mapped_column(String(500), default=None)
    expires_at: Mapped[datetime]
    approved_at: Mapped[datetime | None] = mapped_column(default=None)

"""Donations through Pix: issue a charge, follow it, crown the supporter."""

import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SupportPayment, User
from app.models.enums import SupportPaymentStatus
from app.services.pix_provider import PixProvider, PixStatus

MIN_AMOUNT_CENTS = 500
# Every R$ 30 (or part of it) of an approved donation keeps the badge 30 days.
TIER_CENTS = 3000
DAYS_PER_TIER = 30


def supporter_days(amount_cents: int) -> int:
    """R$ 1 to 30 buys 30 days, R$ 31 to 60 buys 60, and so on."""
    if amount_cents <= 0:
        return 0
    return math.ceil(amount_cents / TIER_CENTS) * DAYS_PER_TIER


@dataclass
class SupportSummary:
    is_supporter: bool
    supporter_since: datetime | None
    supporter_until: datetime | None
    total_cents: int
    last_payment: SupportPayment | None


def create_charge(
    db: Session, user: User, amount_cents: int, provider: PixProvider
) -> SupportPayment:
    payment_id = uuid.uuid4()
    charge = provider.create_charge(
        amount_cents=amount_cents,
        description="Apoio ao Mavva",
        payer_email=user.email,
        payer_name=user.name,
        reference=str(payment_id),
    )
    payment = SupportPayment(
        id=payment_id,
        user_id=user.id,
        amount_cents=amount_cents,
        status=SupportPaymentStatus.PENDING,
        provider=charge.provider,
        provider_payment_id=charge.provider_payment_id,
        qr_code=charge.qr_code,
        ticket_url=charge.ticket_url,
        expires_at=charge.expires_at,
    )
    db.add(payment)
    db.flush()
    return payment


def apply_status(
    db: Session, payment: SupportPayment, status: PixStatus, now: datetime | None = None
) -> bool:
    """Moves a pending charge to what the provider says; returns whether it changed.

    Final states never move again, so a late or repeated webhook is harmless.
    """
    if payment.status != SupportPaymentStatus.PENDING:
        return False
    now = now or datetime.now(UTC)
    if status == PixStatus.APPROVED:
        payment.status = SupportPaymentStatus.APPROVED
        payment.approved_at = now
        user = db.get(User, payment.user_id)
        if user is not None:
            if user.supporter_since is None:
                user.supporter_since = now
            # Stack on the time still running; an expired badge restarts today.
            base = (
                user.supporter_until if user.supporter_until and user.supporter_until > now else now
            )
            user.supporter_until = base + timedelta(days=supporter_days(payment.amount_cents))
        return True
    if status == PixStatus.CANCELLED:
        payment.status = SupportPaymentStatus.CANCELLED
        return True
    if payment.expires_at <= now:
        payment.status = SupportPaymentStatus.EXPIRED
        return True
    return False


def sync_with_provider(db: Session, payment: SupportPayment, provider: PixProvider) -> bool:
    """Asks the provider where a pending charge stands (polling and webhooks)."""
    if payment.status != SupportPaymentStatus.PENDING:
        return False
    now = datetime.now(UTC)
    if payment.expires_at <= now:
        # Not worth a round trip: the code can no longer be paid.
        return apply_status(db, payment, PixStatus.PENDING, now)
    return apply_status(db, payment, provider.fetch_status(payment.provider_payment_id), now)


def by_provider_id(db: Session, provider_payment_id: str) -> SupportPayment | None:
    return db.scalar(
        select(SupportPayment).where(SupportPayment.provider_payment_id == provider_payment_id)
    )


def summary(db: Session, user: User) -> SupportSummary:
    total = db.scalar(
        select(func.coalesce(func.sum(SupportPayment.amount_cents), 0)).where(
            SupportPayment.user_id == user.id,
            SupportPayment.status == SupportPaymentStatus.APPROVED,
        )
    )
    last = db.scalar(
        select(SupportPayment)
        .where(SupportPayment.user_id == user.id)
        .order_by(SupportPayment.created_at.desc(), SupportPayment.id.desc())
        .limit(1)
    )
    return SupportSummary(
        is_supporter=user.is_supporter,
        supporter_since=user.supporter_since,
        supporter_until=user.supporter_until,
        total_cents=int(total or 0),
        last_payment=last,
    )

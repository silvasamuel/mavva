import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SupportPaymentStatus
from app.services.support_service import MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS, supporter_days


class SupportPaymentCreate(BaseModel):
    amount_cents: int = Field(ge=MIN_AMOUNT_CENTS, le=MAX_AMOUNT_CENTS)


class SupportPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount_cents: int
    status: SupportPaymentStatus
    # Badge days this charge grants once approved (every R$ 30 = 30 days).
    supporter_days: int = 0
    provider: str
    qr_code: str
    ticket_url: str | None
    expires_at: datetime
    approved_at: datetime | None
    created_at: datetime


class SupportSummaryOut(BaseModel):
    is_supporter: bool
    supporter_since: datetime | None
    supporter_until: datetime | None
    total_cents: int
    last_payment: SupportPaymentOut | None


def payment_out(payment: Any) -> SupportPaymentOut:
    out = SupportPaymentOut.model_validate(payment)
    out.supporter_days = supporter_days(out.amount_cents)
    return out

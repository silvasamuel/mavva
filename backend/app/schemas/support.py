import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SupportPaymentStatus
from app.services.support_service import MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS


class SupportPaymentCreate(BaseModel):
    amount_cents: int = Field(ge=MIN_AMOUNT_CENTS, le=MAX_AMOUNT_CENTS)


class SupportPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount_cents: int
    status: SupportPaymentStatus
    provider: str
    qr_code: str
    ticket_url: str | None
    expires_at: datetime
    approved_at: datetime | None
    created_at: datetime


class SupportSummaryOut(BaseModel):
    is_supporter: bool
    supporter_since: datetime | None
    total_cents: int
    last_payment: SupportPaymentOut | None

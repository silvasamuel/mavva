"""Apoie o Mavva: Pix donations and the supporter status they grant."""

import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbDep
from app.core.ratelimit import limiter
from app.models import SupportPayment
from app.schemas.support import (
    SupportPaymentCreate,
    SupportPaymentOut,
    SupportSummaryOut,
    payment_out,
)
from app.services import support_service
from app.services.pix_provider import (
    FakePix,
    PixProviderError,
    get_pix_provider,
    verify_mercadopago_signature,
)

logger = logging.getLogger("mavva.support")

router = APIRouter(prefix="/support", tags=["support"])


@router.get("/me", response_model=SupportSummaryOut)
def my_support(user: CurrentUser, db: DbDep) -> SupportSummaryOut:
    """Supporter status plus the latest charge, so a pending Pix survives a reload."""
    info = support_service.summary(db, user)
    if info.last_payment is not None:
        try:
            changed = support_service.sync_with_provider(db, info.last_payment, get_pix_provider())
        except PixProviderError:
            changed = False  # show what we know; the next poll settles it
        if changed:
            db.commit()
            info = support_service.summary(db, user)
    return SupportSummaryOut(
        is_supporter=info.is_supporter,
        supporter_since=info.supporter_since,
        supporter_until=info.supporter_until,
        total_cents=info.total_cents,
        last_payment=payment_out(info.last_payment) if info.last_payment else None,
    )


@router.post("/payments", status_code=status.HTTP_201_CREATED, response_model=SupportPaymentOut)
@limiter.limit("10/minute")
def create_payment(
    request: Request, body: SupportPaymentCreate, user: CurrentUser, db: DbDep
) -> SupportPaymentOut:
    try:
        payment = support_service.create_charge(db, user, body.amount_cents, get_pix_provider())
    except PixProviderError as error:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Não foi possível gerar o Pix agora. Tente de novo em instantes.",
        ) from error
    db.commit()
    return payment_out(payment)


def _own_payment(db: DbDep, user: CurrentUser, payment_id: uuid.UUID) -> SupportPayment:
    payment = db.get(SupportPayment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pagamento não encontrado")
    return payment


@router.get("/payments/{payment_id}", response_model=SupportPaymentOut)
def payment_status(payment_id: uuid.UUID, user: CurrentUser, db: DbDep) -> SupportPaymentOut:
    """Polled by the page while the Pix is pending; asks the provider each time."""
    payment = _own_payment(db, user, payment_id)
    try:
        changed = support_service.sync_with_provider(db, payment, get_pix_provider())
    except PixProviderError:
        changed = False  # keep showing "pending"; the next poll or the webhook settles it
    if changed:
        db.commit()
    return payment_out(payment)


@router.post("/payments/{payment_id}/simulate", response_model=SupportPaymentOut)
def simulate_approval(payment_id: uuid.UUID, user: CurrentUser, db: DbDep) -> SupportPaymentOut:
    """Development only: settles a fake charge as if the Pix had been paid."""
    provider = get_pix_provider()
    if get_settings().is_production or not isinstance(provider, FakePix):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Não encontrado")
    payment = _own_payment(db, user, payment_id)
    provider.approve(payment.provider_payment_id)
    if support_service.sync_with_provider(db, payment, provider):
        db.commit()
    return payment_out(payment)


@router.post("/webhooks/mercadopago", include_in_schema=False)
async def mercadopago_webhook(
    request: Request,
    db: DbDep,
    x_signature: Annotated[str | None, Header()] = None,
    x_request_id: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    """Mercado Pago calls this when a payment changes.

    The call only tells us *which* payment to look at: the status always comes
    from a fresh GET at the provider, so a forged call can't approve anything.
    When a webhook secret is configured the signature is checked as well.
    Always answers 200 for unknown ids so the provider stops retrying.
    """
    try:
        body: Any = await request.json()
    except ValueError:
        body = {}
    data_id = request.query_params.get("data.id") or str(
        ((body or {}).get("data") or {}).get("id", "")
    )
    if not data_id:
        return {"ok": True}
    secret = get_settings().mercadopago_webhook_secret
    if secret and not verify_mercadopago_signature(
        secret=secret, x_signature=x_signature, x_request_id=x_request_id, data_id=data_id
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Assinatura inválida")
    payment = support_service.by_provider_id(db, data_id)
    if payment is None:
        logger.info("Webhook for unknown payment %s", data_id)
        return {"ok": True}
    try:
        if support_service.sync_with_provider(db, payment, get_pix_provider()):
            db.commit()
    except PixProviderError:
        # Tell the provider to retry later instead of swallowing the update.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Tente de novo") from None
    return {"ok": True}

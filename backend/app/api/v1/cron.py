import hmac
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import get_settings
from app.core.deps import DbDep
from app.services import review_digest

router = APIRouter(prefix="/cron", tags=["cron"])


def _require_cron_secret(authorization: str | None) -> None:
    secret = get_settings().cron_secret
    if not secret:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autorizado")


@router.get("/review-digest")
def send_review_digest(
    db: DbDep, authorization: Annotated[str | None, Header()] = None
) -> dict[str, int | bool]:
    _require_cron_secret(authorization)
    digest, sent = review_digest.send_if_pending(db)
    return {
        "sent": sent,
        "questions": digest.questions.total,
        "features": digest.features.total,
        "corrections": digest.corrections.total,
    }

"""Daily e-mail to the admin listing what is waiting in the review inbox."""

import logging
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSuggestion, QuestionProposal
from app.models.enums import AppSuggestionKind, AppSuggestionStatus, QuestionProposalStatus
from app.services import email_service
from app.services.email_templates import review_digest_email_html

logger = logging.getLogger("mavva.digest")


@dataclass(frozen=True)
class PendingCount:
    total: int
    new: int


@dataclass(frozen=True)
class ReviewDigest:
    questions: PendingCount
    features: PendingCount
    corrections: PendingCount

    @property
    def is_empty(self) -> bool:
        return not (self.questions.total or self.features.total or self.corrections.total)


def _pending(
    db: Session,
    model: type[QuestionProposal] | type[AppSuggestion],
    *conditions: ColumnElement[bool],
) -> PendingCount:
    since = func.now() - timedelta(days=1)
    total, new = db.execute(
        select(func.count(), func.count().filter(model.created_at >= since)).where(*conditions)
    ).one()
    return PendingCount(total=total or 0, new=new or 0)


def collect(db: Session) -> ReviewDigest:
    open_suggestion = AppSuggestion.status == AppSuggestionStatus.OPEN
    return ReviewDigest(
        questions=_pending(
            db, QuestionProposal, QuestionProposal.status == QuestionProposalStatus.PENDING
        ),
        features=_pending(
            db, AppSuggestion, open_suggestion, AppSuggestion.kind == AppSuggestionKind.FEATURE
        ),
        corrections=_pending(
            db,
            AppSuggestion,
            open_suggestion,
            AppSuggestion.kind == AppSuggestionKind.CORRECTION,
        ),
    )


def send_if_pending(db: Session) -> tuple[ReviewDigest, bool]:
    """Returns the counts and whether an e-mail went out."""
    digest = collect(db)
    settings = get_settings()
    if digest.is_empty:
        return digest, False
    if not settings.admin_digest_email:
        logger.warning("Review digest has pending items but ADMIN_DIGEST_EMAIL is not set")
        return digest, False

    link = f"{settings.public_origin}/admin"
    if not settings.resend_api_key:
        logger.info("Review digest for %s: %s (%s)", settings.admin_digest_email, digest, link)
        return digest, False

    email_service.deliver(
        settings.admin_digest_email,
        "Mavva — itens aguardando revisão",
        review_digest_email_html(
            questions=(digest.questions.total, digest.questions.new),
            features=(digest.features.total, digest.features.new),
            corrections=(digest.corrections.total, digest.corrections.new),
            link=link,
        ),
    )
    return digest, True

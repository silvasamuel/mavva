from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbDep
from app.schemas.moderation import (
    FlagCreateRequest,
    FlagCreateResponse,
    ProposalCreateResponse,
    QuestionDraft,
    SuggestionCreateRequest,
    SuggestionCreateResponse,
)
from app.services import moderation_service
from app.services.moderation_service import ModerationError
from app.services.rate_limit_service import enforce_user_limit

router = APIRouter(tags=["moderation"])


@router.post("/flags", status_code=status.HTTP_201_CREATED, response_model=FlagCreateResponse)
def report_question(body: FlagCreateRequest, user: CurrentUser, db: DbDep) -> FlagCreateResponse:
    enforce_user_limit(db, user.id, "flag", limit=20, window_seconds=3600)
    try:
        flag = moderation_service.create_flag(
            db,
            user,
            question_id=body.question_id,
            reason=body.reason,
            comment=body.comment,
            session_id=body.session_id,
        )
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return FlagCreateResponse(id=flag.id, status=flag.status)


@router.post(
    "/proposals", status_code=status.HTTP_201_CREATED, response_model=ProposalCreateResponse
)
def submit_question(body: QuestionDraft, user: CurrentUser, db: DbDep) -> ProposalCreateResponse:
    enforce_user_limit(db, user.id, "proposal", limit=10, window_seconds=3600)
    try:
        proposal = moderation_service.create_proposal(db, user, body)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return ProposalCreateResponse(id=proposal.id, status=proposal.status)


@router.post(
    "/suggestions", status_code=status.HTTP_201_CREATED, response_model=SuggestionCreateResponse
)
def submit_suggestion(
    body: SuggestionCreateRequest, user: CurrentUser, db: DbDep
) -> SuggestionCreateResponse:
    enforce_user_limit(db, user.id, "suggestion", limit=10, window_seconds=3600)
    try:
        suggestion = moderation_service.create_suggestion(db, user, body.kind, body.body)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return SuggestionCreateResponse(id=suggestion.id, status=suggestion.status)

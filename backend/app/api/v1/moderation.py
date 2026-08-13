from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbDep
from app.schemas.moderation import (
    FlagCreateRequest,
    FlagCreateResponse,
    ProposalCreateResponse,
    QuestionDraft,
)
from app.services import moderation_service
from app.services.moderation_service import ModerationError

router = APIRouter(tags=["moderation"])


@router.post("/flags", status_code=status.HTTP_201_CREATED, response_model=FlagCreateResponse)
def report_question(body: FlagCreateRequest, user: CurrentUser, db: DbDep) -> FlagCreateResponse:
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
    try:
        proposal = moderation_service.create_proposal(db, user, body)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return ProposalCreateResponse(id=proposal.id, status=proposal.status)

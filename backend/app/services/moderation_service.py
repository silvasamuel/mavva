import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.data.books import BOOKS
from app.models import Category, Question, QuestionFlag, QuestionProposal, QuizSession, User
from app.models.enums import (
    QuestionFlagReason,
    QuestionFlagStatus,
    QuestionProposalStatus,
    QuestionType,
)
from app.schemas.moderation import QuestionDraft
from app.seeds.questions import sync_accepted_answers, sync_options

MAX_PENDING_PROPOSALS = 5


class ModerationError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


def create_flag(
    db: Session,
    user: User,
    *,
    question_id: uuid.UUID,
    reason: QuestionFlagReason,
    comment: str | None,
    session_id: uuid.UUID | None,
) -> QuestionFlag:
    question = db.get(Question, question_id)
    if question is None:
        raise ModerationError("Pergunta não encontrada", status_code=404)
    if session_id is not None:
        session = db.scalar(
            select(QuizSession)
            .where(QuizSession.id == session_id, QuizSession.user_id == user.id)
            .options(selectinload(QuizSession.session_questions))
        )
        if session is None:
            raise ModerationError("Sessão não encontrada", status_code=404)
        if not any(sq.question_id == question_id for sq in session.session_questions):
            raise ModerationError("Esta pergunta não pertence à sessão")
    existing = db.scalar(
        select(QuestionFlag).where(
            QuestionFlag.user_id == user.id, QuestionFlag.question_id == question_id
        )
    )
    if existing is not None:
        raise ModerationError("Você já reportou esta pergunta")
    flag = QuestionFlag(
        user_id=user.id,
        question_id=question_id,
        session_id=session_id,
        reason=reason,
        comment=(comment or "").strip() or None,
    )
    db.add(flag)
    db.flush()
    return flag


def create_proposal(db: Session, user: User, draft: QuestionDraft) -> QuestionProposal:
    pending = (
        db.scalar(
            select(func.count())
            .select_from(QuestionProposal)
            .where(
                QuestionProposal.user_id == user.id,
                QuestionProposal.status == QuestionProposalStatus.PENDING,
            )
        )
        or 0
    )
    if pending >= MAX_PENDING_PROPOSALS:
        raise ModerationError(f"Você já tem {MAX_PENDING_PROPOSALS} sugestões aguardando revisão")
    _validate_draft(db, draft)
    proposal = QuestionProposal(user_id=user.id, payload=draft.model_dump(mode="json"))
    db.add(proposal)
    db.flush()
    return proposal


def list_open_flags(db: Session) -> list[QuestionFlag]:
    return list(
        db.scalars(
            select(QuestionFlag)
            .where(QuestionFlag.status == QuestionFlagStatus.OPEN)
            .options(selectinload(QuestionFlag.user), selectinload(QuestionFlag.question))
            .order_by(QuestionFlag.created_at.desc())
            .limit(100)
        )
    )


def list_pending_proposals(db: Session) -> list[QuestionProposal]:
    return list(
        db.scalars(
            select(QuestionProposal)
            .where(QuestionProposal.status == QuestionProposalStatus.PENDING)
            .options(selectinload(QuestionProposal.user))
            .order_by(QuestionProposal.created_at.desc())
            .limit(100)
        )
    )


def set_flag_status(db: Session, flag_id: uuid.UUID, status: QuestionFlagStatus) -> QuestionFlag:
    flag = db.get(QuestionFlag, flag_id)
    if flag is None:
        raise ModerationError("Report não encontrado", status_code=404)
    if flag.status != QuestionFlagStatus.OPEN:
        raise ModerationError("Este report já foi tratado")
    flag.status = status
    db.flush()
    return flag


def deactivate_question(db: Session, question_id: uuid.UUID) -> Question:
    question = db.get(Question, question_id)
    if question is None:
        raise ModerationError("Pergunta não encontrada", status_code=404)
    question.is_active = False
    db.flush()
    return question


def approve_proposal(
    db: Session, proposal_id: uuid.UUID, draft: QuestionDraft | None = None
) -> QuestionProposal:
    proposal = db.get(QuestionProposal, proposal_id)
    if proposal is None:
        raise ModerationError("Sugestão não encontrada", status_code=404)
    if proposal.status != QuestionProposalStatus.PENDING:
        raise ModerationError("Esta sugestão já foi tratada")
    body = draft or QuestionDraft.model_validate(proposal.payload)
    question = _create_question(db, body)
    proposal.status = QuestionProposalStatus.APPROVED
    proposal.question_id = question.id
    db.flush()
    return proposal


def reject_proposal(db: Session, proposal_id: uuid.UUID) -> QuestionProposal:
    proposal = db.get(QuestionProposal, proposal_id)
    if proposal is None:
        raise ModerationError("Sugestão não encontrada", status_code=404)
    if proposal.status != QuestionProposalStatus.PENDING:
        raise ModerationError("Esta sugestão já foi tratada")
    proposal.status = QuestionProposalStatus.REJECTED
    db.flush()
    return proposal


def _validate_draft(db: Session, draft: QuestionDraft) -> Category:
    category = db.get(Category, draft.category_id)
    if category is None:
        raise ModerationError("Categoria inválida")
    if draft.book not in BOOKS:
        raise ModerationError(f"Livro inválido: {draft.book}")
    return category


def next_external_id(db: Session, slug: str) -> str:
    prefix = f"{slug}-"
    ids = db.scalars(select(Question.external_id).where(Question.external_id.like(f"{prefix}%")))
    highest = 0
    for external_id in ids:
        suffix = external_id.removeprefix(prefix)
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return f"{prefix}{highest + 1:04d}"


def _create_question(db: Session, draft: QuestionDraft) -> Question:
    category = _validate_draft(db, draft)
    book = BOOKS[draft.book]
    question = Question(
        external_id=next_external_id(db, category.slug),
        type=draft.type,
        text=draft.text,
        explanation=draft.explanation,
        divergence_note=draft.divergence_note,
        testament=book.testament,
        book=draft.book,
        chapter=draft.chapter,
        verse_start=draft.verse_start,
        verse_end=draft.verse_end,
        theme=draft.theme,
        difficulty=draft.difficulty,
        category_id=category.id,
        subcategory=draft.subcategory,
        tags=[t.strip().lower() for t in draft.tags],
        is_active=True,
    )
    db.add(question)
    db.flush()
    if draft.type == QuestionType.MULTIPLE_CHOICE:
        sync_options(question, draft.options)
    else:
        sync_accepted_answers(question, draft.accepted_answers)
    db.flush()
    return question

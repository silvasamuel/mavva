"""Admin-only API. Every route depends on AdminUser (403 for non-admins)."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbDep
from app.data.books import BOOKS
from app.models import (
    Category,
    Question,
    QuestionFlag,
    QuestionProposal,
    User,
    UserStats,
)
from app.models.enums import Difficulty, QuestionFlagStatus, QuestionType
from app.schemas.admin import (
    AdminAnswer,
    AdminCategoryOut,
    AdminDashboardOut,
    AdminOption,
    AdminQuestionDetail,
    AdminQuestionList,
    AdminQuestionListItem,
    AdminQuestionUpdate,
    AdminUserDetail,
    AdminUserList,
    AdminUserOut,
    AdminUserUpdate,
    ContentPublishOut,
    ContentStatusOut,
)
from app.schemas.moderation import AdminFlagOut, AdminProposalOut, AdminReviewInbox, QuestionDraft
from app.seeds.questions import OptionIn, sync_accepted_answers, sync_options
from app.services import admin_stats, auth_service, content_sync, moderation_service
from app.services.content_sync import ContentSyncError
from app.services.moderation_service import ModerationError

# The AdminUser dependency on every path parameter is what enforces access.
router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardOut)
def admin_dashboard(_admin: AdminUser, db: DbDep) -> AdminDashboardOut:
    return admin_stats.dashboard(db)


@router.get("/users", response_model=AdminUserList)
def list_users(
    _admin: AdminUser,
    db: DbDep,
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AdminUserList:
    query = select(User).join(UserStats, UserStats.user_id == User.id)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(func.lower(User.email).like(term), func.lower(User.name).like(term))
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = db.scalars(
        query.options(selectinload(User.stats))
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = [_admin_user_out(u) for u in users]
    return AdminUserList(items=items, total=total, limit=limit, offset=offset)


def _load_user(db: DbDep, user_id: uuid.UUID) -> User:
    user = db.scalar(select(User).where(User.id == user_id).options(selectinload(User.stats)))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    return user


def _admin_user_out(user: User) -> AdminUserOut:
    stats = user.stats
    answered = stats.questions_answered
    return AdminUserOut(
        id=user.id,
        name=user.name,
        username=user.username,
        email=user.email,
        role=user.role,
        timezone=user.timezone,
        daily_goal_xp=user.daily_goal_xp,
        created_at=user.created_at,
        email_verified_at=user.email_verified_at,
        is_active=user.is_active,
        total_xp=stats.total_xp,
        level=stats.level,
        current_streak=stats.current_streak,
        questions_answered=answered,
        accuracy=(stats.correct_answers / answered if answered else None),
    )


def _admin_user_detail(user: User) -> AdminUserDetail:
    stats = user.stats
    return AdminUserDetail(
        **_admin_user_out(user).model_dump(),
        updated_at=user.updated_at,
        longest_streak=stats.longest_streak,
        last_activity_date=stats.last_activity_date,
        correct_answers=stats.correct_answers,
        perfect_sessions=stats.perfect_sessions,
        total_time_seconds=stats.total_time_seconds,
        duel_wins=stats.duel_wins,
        duel_losses=stats.duel_losses,
        duel_draws=stats.duel_draws,
        current_duel_streak=stats.current_duel_streak,
        best_duel_streak=stats.best_duel_streak,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(_admin: AdminUser, db: DbDep, user_id: uuid.UUID) -> AdminUserDetail:
    return _admin_user_detail(_load_user(db, user_id))


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
def update_user(
    admin: AdminUser, db: DbDep, user_id: uuid.UUID, body: AdminUserUpdate
) -> AdminUserDetail:
    user = _load_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Você não pode alterar o status da própria conta."
        )
    if user.is_active and not body.is_active:
        user.is_active = False
        auth_service.revoke_all_refresh_tokens(db, user.id)
    else:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return _admin_user_detail(_load_user(db, user.id))


@router.get("/categories", response_model=list[AdminCategoryOut])
def list_categories(_admin: AdminUser, db: DbDep) -> list[AdminCategoryOut]:
    categories = db.scalars(select(Category).order_by(Category.display_order)).all()
    return [AdminCategoryOut(id=c.id, slug=c.slug, name=c.name, icon=c.icon) for c in categories]


@router.get("/questions", response_model=AdminQuestionList)
def list_questions(
    _admin: AdminUser,
    db: DbDep,
    search: str | None = Query(default=None, max_length=200),
    category_id: int | None = None,
    difficulty: Difficulty | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AdminQuestionList:
    query = select(Question).join(Category, Category.id == Question.category_id)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(func.lower(Question.text).like(term), func.lower(Question.external_id).like(term))
        )
    if category_id is not None:
        query = query.where(Question.category_id == category_id)
    if difficulty is not None:
        query = query.where(Question.difficulty == difficulty)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.add_columns(Category.name).order_by(Question.external_id).limit(limit).offset(offset)
    ).all()
    items = [
        AdminQuestionListItem(
            id=q.id,
            external_id=q.external_id,
            type=q.type,
            text=q.text,
            difficulty=q.difficulty,
            category_id=q.category_id,
            category_name=category_name,
            is_active=q.is_active,
        )
        for q, category_name in rows
    ]
    return AdminQuestionList(items=items, total=total, limit=limit, offset=offset)


def _load_question(db: DbDep, question_id: uuid.UUID) -> Question:
    question = db.scalar(
        select(Question)
        .where(Question.id == question_id)
        .options(selectinload(Question.options), selectinload(Question.accepted_answers))
    )
    if question is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pergunta não encontrada")
    return question


def _detail(question: Question) -> AdminQuestionDetail:
    return AdminQuestionDetail(
        id=question.id,
        external_id=question.external_id,
        type=question.type,
        text=question.text,
        explanation=question.explanation,
        divergence_note=question.divergence_note,
        testament=question.testament,
        book=question.book,
        chapter=question.chapter,
        verse_start=question.verse_start,
        verse_end=question.verse_end,
        difficulty=question.difficulty,
        category_id=question.category_id,
        is_active=question.is_active,
        options=[AdminOption(text=o.text, is_correct=o.is_correct) for o in question.options],
        accepted_answers=[AdminAnswer(text=a.text) for a in question.accepted_answers],
    )


@router.get("/content/status", response_model=ContentStatusOut)
def content_status(_admin: AdminUser, db: DbDep) -> ContentStatusOut:
    """Which content files differ from the DB (pending 'Publicar')."""
    files = content_sync.rendered_files(db)
    try:
        dirty = content_sync.dirty_files(db, files)
    except ContentSyncError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, error.message) from error
    return ContentStatusOut(mode=content_sync.write_mode(), dirty_files=sorted(dirty))


@router.post("/content/publish", response_model=ContentPublishOut)
def content_publish(_admin: AdminUser, db: DbDep) -> ContentPublishOut:
    """Writes the DB question bank back to content/questions/*.json.

    Local mode writes to disk (review via git); github mode opens (or updates)
    a pull request against the configured base branch.
    """
    files = content_sync.rendered_files(db)
    try:
        dirty = content_sync.dirty_files(db, files)
        if not dirty:
            return ContentPublishOut(
                mode=content_sync.write_mode(), published=[], commit_url=None, pr_url=None
            )
        result = content_sync.publish(
            {path: files[path] for path in dirty},
            "content: update questions from admin panel",
        )
    except ContentSyncError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, error.message) from error
    return ContentPublishOut(
        mode=content_sync.write_mode(),
        published=sorted(dirty),
        commit_url=result.commit_url,
        pr_url=result.pr_url,
    )


@router.get("/questions/{question_id}", response_model=AdminQuestionDetail)
def get_question(question_id: uuid.UUID, _admin: AdminUser, db: DbDep) -> AdminQuestionDetail:
    return _detail(_load_question(db, question_id))


@router.patch("/questions/{question_id}", response_model=AdminQuestionDetail)
def update_question(
    question_id: uuid.UUID, body: AdminQuestionUpdate, _admin: AdminUser, db: DbDep
) -> AdminQuestionDetail:
    question = _load_question(db, question_id)
    data = body.model_dump(exclude_unset=True)

    if "book" in data:
        if data["book"] not in BOOKS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Livro inválido: {data['book']}")
        question.testament = BOOKS[data["book"]].testament

    # Answer key: enforce the same invariants the seed does.
    if "options" in data:
        if question.type != QuestionType.MULTIPLE_CHOICE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Só perguntas de múltipla escolha têm alternativas"
            )
        options = data.pop("options")
        if len(options) != 4 or sum(1 for o in options if o["is_correct"]) != 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Múltipla escolha exige 4 alternativas e exatamente 1 correta",
            )
        sync_options(
            question,
            [OptionIn(text=o["text"], correct=o["is_correct"]) for o in options],
        )
    if "accepted_answers" in data:
        if question.type != QuestionType.OPEN_ANSWER:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Só perguntas abertas têm respostas aceitas"
            )
        answers = data.pop("accepted_answers")
        if not answers:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Informe ao menos uma resposta aceita")
        sync_accepted_answers(question, [a["text"] for a in answers])

    for field, value in data.items():
        setattr(question, field, value)

    db.commit()
    db.refresh(question)
    return _detail(_load_question(db, question_id))


def _flag_out(flag: QuestionFlag) -> AdminFlagOut:
    return AdminFlagOut(
        id=flag.id,
        created_at=flag.created_at,
        reason=flag.reason,
        comment=flag.comment,
        status=flag.status,
        reporter_name=flag.user.name,
        reporter_username=flag.user.username,
        question_id=flag.question_id,
        question_text=flag.question.text,
        question_external_id=flag.question.external_id,
        question_active=flag.question.is_active,
    )


def _proposal_out(proposal: QuestionProposal) -> AdminProposalOut:
    return AdminProposalOut(
        id=proposal.id,
        created_at=proposal.created_at,
        status=proposal.status,
        author_name=proposal.user.name,
        author_username=proposal.user.username,
        payload=proposal.payload,
        question_id=proposal.question_id,
    )


@router.get("/review", response_model=AdminReviewInbox)
def review_inbox(_admin: AdminUser, db: DbDep) -> AdminReviewInbox:
    flags = moderation_service.list_open_flags(db)
    proposals = moderation_service.list_pending_proposals(db)
    return AdminReviewInbox(
        open_flags=len(flags),
        pending_proposals=len(proposals),
        flags=[_flag_out(flag) for flag in flags],
        proposals=[_proposal_out(proposal) for proposal in proposals],
    )


@router.post("/review/flags/{flag_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
def resolve_flag(flag_id: uuid.UUID, _admin: AdminUser, db: DbDep) -> None:
    try:
        moderation_service.set_flag_status(db, flag_id, QuestionFlagStatus.RESOLVED)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()


@router.post("/review/flags/{flag_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_flag(flag_id: uuid.UUID, _admin: AdminUser, db: DbDep) -> None:
    try:
        moderation_service.set_flag_status(db, flag_id, QuestionFlagStatus.DISMISSED)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()


@router.post("/review/flags/{flag_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_flagged_question(flag_id: uuid.UUID, _admin: AdminUser, db: DbDep) -> None:
    try:
        flag = moderation_service.set_flag_status(db, flag_id, QuestionFlagStatus.RESOLVED)
        moderation_service.deactivate_question(db, flag.question_id)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()


@router.post("/review/proposals/{proposal_id}/approve", response_model=AdminProposalOut)
def approve_proposal(
    proposal_id: uuid.UUID, body: QuestionDraft, _admin: AdminUser, db: DbDep
) -> AdminProposalOut:
    try:
        proposal = moderation_service.approve_proposal(db, proposal_id, body)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    db.refresh(proposal, attribute_names=["user"])
    return _proposal_out(proposal)


@router.post("/review/proposals/{proposal_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_proposal(proposal_id: uuid.UUID, _admin: AdminUser, db: DbDep) -> None:
    try:
        moderation_service.reject_proposal(db, proposal_id)
    except ModerationError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()

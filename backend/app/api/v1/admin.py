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
    QuestionAnswer,
    QuestionOption,
    User,
    UserStats,
)
from app.models.enums import Difficulty, QuestionType
from app.schemas.admin import (
    AdminAnswer,
    AdminCategoryOut,
    AdminOption,
    AdminQuestionDetail,
    AdminQuestionList,
    AdminQuestionListItem,
    AdminQuestionUpdate,
    AdminUserList,
    AdminUserOut,
    ContentPublishOut,
    ContentStatusOut,
)
from app.services import content_sync
from app.services.content_sync import ContentSyncError

# The AdminUser dependency on every path parameter is what enforces access.
router = APIRouter(prefix="/admin", tags=["admin"])


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
    items = [
        AdminUserOut(
            id=u.id,
            name=u.name,
            email=u.email,
            role=u.role,
            timezone=u.timezone,
            daily_goal_xp=u.daily_goal_xp,
            created_at=u.created_at,
            total_xp=u.stats.total_xp,
            level=u.stats.level,
            current_streak=u.stats.current_streak,
            questions_answered=u.stats.questions_answered,
            accuracy=(
                u.stats.correct_answers / u.stats.questions_answered
                if u.stats.questions_answered
                else None
            ),
        )
        for u in users
    ]
    return AdminUserList(items=items, total=total, limit=limit, offset=offset)


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
        theme=question.theme,
        difficulty=question.difficulty,
        category_id=question.category_id,
        subcategory=question.subcategory,
        tags=list(question.tags),
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

    Local mode writes to disk (review via git); github mode lands every dirty
    file in one commit on the configured branch, whose deploy re-seeds the DB.
    """
    files = content_sync.rendered_files(db)
    try:
        dirty = content_sync.dirty_files(db, files)
        if not dirty:
            return ContentPublishOut(mode=content_sync.write_mode(), published=[], commit_url=None)
        commit_url = content_sync.publish(
            {path: files[path] for path in dirty},
            "content: update questions from admin panel",
        )
    except ContentSyncError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, error.message) from error
    return ContentPublishOut(
        mode=content_sync.write_mode(), published=sorted(dirty), commit_url=commit_url
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
        question.options.clear()
        question.options.extend(
            QuestionOption(text=o["text"], is_correct=o["is_correct"], position=i)
            for i, o in enumerate(options)
        )
    if "accepted_answers" in data:
        if question.type != QuestionType.OPEN_ANSWER:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Só perguntas abertas têm respostas aceitas"
            )
        answers = data.pop("accepted_answers")
        if not answers:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Informe ao menos uma resposta aceita")
        question.accepted_answers.clear()
        question.accepted_answers.extend(
            QuestionAnswer(text=a["text"].strip(), position=i) for i, a in enumerate(answers)
        )

    if "tags" in data:
        question.tags = [t.strip().lower() for t in data.pop("tags")]

    for field, value in data.items():
        setattr(question, field, value)

    db.commit()
    db.refresh(question)
    return _detail(_load_question(db, question_id))

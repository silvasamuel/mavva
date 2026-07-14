import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Achievement,
    Question,
    QuestionOption,
    QuizAnswer,
    QuizSession,
    QuizSessionQuestion,
    ReviewItem,
    User,
    UserStats,
)
from app.models.enums import Difficulty, QuestionType, QuizMode, Testament
from app.services import achievement_service, answer_checker, srs
from app.services.gamification import (
    PERFECT_SESSION_BONUS,
    SESSION_COMPLETE_BONUS,
    StreakUpdate,
    level_from_total_xp,
    register_streak_activity,
    today_for_user,
    upsert_daily_activity,
    xp_for_answer,
)

MAX_SESSION_DURATION_SECONDS = 2 * 60 * 60


class QuizError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


def create_session(
    db: Session,
    user: User,
    *,
    mode: QuizMode,
    question_count: int,
    testament: Testament | None = None,
    category_ids: list[int] | None = None,
    difficulty: Difficulty | None = None,
    theme: str | None = None,
) -> QuizSession:
    if mode == QuizMode.REVIEW:
        today = today_for_user(user)
        question_ids = srs.due_question_ids(db, user.id, today, question_count)
        if not question_ids:
            raise QuizError("Você não tem revisões pendentes hoje")
    else:
        # Smart queue: unseen questions come first (random order), then questions
        # the user got wrong, and correctly-answered ones sink to the back — the
        # more consecutive hits (SRS repetitions), the later they resurface.
        query = (
            select(Question.id)
            .outerjoin(
                ReviewItem,
                (ReviewItem.question_id == Question.id) & (ReviewItem.user_id == user.id),
            )
            .where(Question.is_active)
        )
        if testament is not None:
            query = query.where(Question.testament == testament)
        if category_ids:
            query = query.where(Question.category_id.in_(category_ids))
        if difficulty is not None:
            query = query.where(Question.difficulty == difficulty)
        if theme is not None:
            query = query.where(Question.theme.ilike(f"%{theme}%"))
        query = query.order_by(
            func.coalesce(ReviewItem.repetitions, -1).asc(), func.random()
        ).limit(question_count)
        question_ids = list(db.scalars(query))
        if not question_ids:
            raise QuizError("Nenhuma pergunta encontrada para esses filtros")

    session = QuizSession(
        user_id=user.id,
        mode=mode,
        question_count=len(question_ids),
        filters={
            "testament": testament.value if testament else None,
            "category_ids": category_ids or None,
            "difficulty": difficulty.value if difficulty else None,
            "theme": theme,
        },
    )
    db.add(session)
    db.flush()
    for position, question_id in enumerate(question_ids):
        db.add(
            QuizSessionQuestion(session_id=session.id, question_id=question_id, position=position)
        )
    db.flush()
    return session


def get_session_for_user(db: Session, user: User, session_id: uuid.UUID) -> QuizSession:
    session = db.scalar(
        select(QuizSession)
        .where(QuizSession.id == session_id, QuizSession.user_id == user.id)
        .options(
            selectinload(QuizSession.session_questions)
            .selectinload(QuizSessionQuestion.question)
            .selectinload(Question.options),
            selectinload(QuizSession.session_questions)
            .selectinload(QuizSessionQuestion.question)
            .selectinload(Question.category),
            selectinload(QuizSession.answers),
        )
    )
    if session is None:
        raise QuizError("Sessão não encontrada", status_code=404)
    return session


@dataclass
class AnswerResult:
    is_correct: bool
    correct_option_id: uuid.UUID | None
    correct_answer: str | None
    explanation: str
    divergence_note: str | None
    question: Question
    xp_earned: int


def submit_answer(
    db: Session,
    user: User,
    session_id: uuid.UUID,
    *,
    question_id: uuid.UUID,
    selected_option_id: uuid.UUID | None,
    answer_text: str | None,
    time_spent_seconds: int | None,
) -> AnswerResult:
    session = get_session_for_user(db, user, session_id)
    if session.completed_at is not None:
        raise QuizError("Esta sessão já foi concluída")

    question = next(
        (sq.question for sq in session.session_questions if sq.question_id == question_id), None
    )
    if question is None:
        raise QuizError("Esta pergunta não pertence à sessão")
    if any(a.question_id == question_id for a in session.answers):
        raise QuizError("Esta pergunta já foi respondida")

    correct_option: QuestionOption | None = None
    if question.type == QuestionType.MULTIPLE_CHOICE:
        if selected_option_id is None:
            raise QuizError("Selecione uma alternativa")
        selected = next((o for o in question.options if o.id == selected_option_id), None)
        if selected is None:
            raise QuizError("Alternativa inválida para esta pergunta")
        correct_option = next(o for o in question.options if o.is_correct)
        is_correct = selected.is_correct
    else:
        if not answer_text or not answer_text.strip():
            raise QuizError("Digite uma resposta")
        accepted = [a.text for a in question.accepted_answers]
        is_correct = answer_checker.is_answer_correct(answer_text, accepted)

    xp = xp_for_answer(question.difficulty, is_correct)
    db.add(
        QuizAnswer(
            session_id=session.id,
            question_id=question.id,
            selected_option_id=selected_option_id,
            answer_text=answer_text,
            is_correct=is_correct,
            time_spent_seconds=time_spent_seconds,
        )
    )
    if is_correct:
        session.correct_count += 1
    session.xp_earned += xp

    # SRS updates immediately (survives abandoned sessions).
    srs.record_answer(db, user.id, question.id, is_correct, today_for_user(user))
    db.flush()

    canonical_answer = (
        question.accepted_answers[0].text
        if question.type == QuestionType.OPEN_ANSWER and question.accepted_answers
        else None
    )
    return AnswerResult(
        is_correct=is_correct,
        correct_option_id=correct_option.id if correct_option else None,
        correct_answer=canonical_answer,
        explanation=question.explanation,
        divergence_note=question.divergence_note,
        question=question,
        xp_earned=xp,
    )


@dataclass
class CompleteResult:
    session: QuizSession
    accuracy: float
    bonus_xp: int
    level: int
    leveled_up: bool
    xp_into_level: int
    xp_for_next_level: int
    streak: StreakUpdate
    daily_goal_target: int
    daily_goal_earned: int
    unlocked_achievements: list[Achievement] = field(default_factory=list)


def complete_session(db: Session, user: User, session_id: uuid.UUID) -> CompleteResult:
    session = get_session_for_user(db, user, session_id)
    if session.completed_at is not None:
        raise QuizError("Esta sessão já foi concluída")
    answered_count = len(session.answers)
    if answered_count == 0:
        raise QuizError("Responda ao menos uma pergunta antes de concluir")

    now = datetime.now(UTC)
    started_at = session.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    elapsed = int((now - started_at).total_seconds())
    session.duration_seconds = max(0, min(elapsed, MAX_SESSION_DURATION_SECONDS))

    bonus = SESSION_COMPLETE_BONUS if answered_count == session.question_count else 0
    is_perfect = (
        answered_count == session.question_count and session.correct_count == session.question_count
    )
    if is_perfect:
        bonus += PERFECT_SESSION_BONUS
    session.xp_earned += bonus
    session.completed_at = now

    stats = db.get(UserStats, user.id)
    assert stats is not None
    previous_level, _, _ = level_from_total_xp(stats.total_xp)
    # Session XP can be negative (errors cost half a question's value),
    # but the lifetime total never drops below zero.
    stats.total_xp = max(0, stats.total_xp + session.xp_earned)
    stats.questions_answered += answered_count
    stats.correct_answers += session.correct_count
    stats.total_time_seconds += session.duration_seconds
    if is_perfect:
        stats.perfect_sessions += 1
    level, xp_into_level, xp_for_next = level_from_total_xp(stats.total_xp)
    stats.level = level

    today = today_for_user(user)
    streak = register_streak_activity(stats, today)
    activity = upsert_daily_activity(
        db,
        user.id,
        today,
        xp=session.xp_earned,
        questions=answered_count,
        correct=session.correct_count,
        time_seconds=session.duration_seconds,
    )

    unlocked = achievement_service.evaluate_achievements(db, user, stats)
    db.flush()

    return CompleteResult(
        session=session,
        accuracy=session.correct_count / answered_count,
        bonus_xp=bonus,
        level=level,
        leveled_up=level > previous_level,
        xp_into_level=xp_into_level,
        xp_for_next_level=xp_for_next,
        streak=streak,
        daily_goal_target=user.daily_goal_xp,
        daily_goal_earned=max(0, activity.xp),
        unlocked_achievements=unlocked,
    )


def recent_sessions(db: Session, user: User, limit: int = 10) -> list[QuizSession]:
    return list(
        db.scalars(
            select(QuizSession)
            .where(QuizSession.user_id == user.id, QuizSession.completed_at.is_not(None))
            .order_by(QuizSession.completed_at.desc())
            .limit(limit)
        )
    )


def session_filters(session: QuizSession) -> dict[str, Any]:
    return {k: v for k, v in (session.filters or {}).items() if v is not None}

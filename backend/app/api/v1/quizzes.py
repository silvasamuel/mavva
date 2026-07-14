import uuid

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbDep
from app.data.books import BOOKS, format_reference
from app.models import Question, QuizSession
from app.models.enums import QuestionType
from app.schemas.quiz import (
    AnswerFeedback,
    AnswerRequest,
    BibleReference,
    DailyGoalInfo,
    LevelInfo,
    QuestionOptionOut,
    QuestionOut,
    QuizAbandonResponse,
    QuizCompleteResponse,
    QuizCreateRequest,
    QuizHistoryItem,
    QuizSessionOut,
    StreakInfo,
    UnlockedAchievement,
)
from app.services import quiz_service
from app.services.quiz_service import QuizError

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


def _reference(question: Question) -> BibleReference:
    return BibleReference(
        book=question.book,
        book_name=BOOKS[question.book].name,
        chapter=question.chapter,
        verse_start=question.verse_start,
        verse_end=question.verse_end,
        display=format_reference(
            question.book, question.chapter, question.verse_start, question.verse_end
        ),
    )


def _session_out(session: QuizSession) -> QuizSessionOut:
    answered_ids = {a.question_id for a in session.answers}
    return QuizSessionOut(
        id=session.id,
        mode=session.mode,
        question_count=session.question_count,
        correct_count=session.correct_count,
        answered_count=len(answered_ids),
        completed=session.completed_at is not None,
        timer_seconds=(session.filters or {}).get("timer_seconds"),
        filters=quiz_service.session_filters(session),
        questions=[
            QuestionOut(
                id=sq.question.id,
                position=sq.position,
                type=sq.question.type,
                text=sq.question.text,
                difficulty=sq.question.difficulty,
                category_name=sq.question.category.name,
                category_icon=sq.question.category.icon,
                options=[QuestionOptionOut(id=o.id, text=o.text) for o in sq.question.options]
                if sq.question.type == QuestionType.MULTIPLE_CHOICE
                else [],
                answered=sq.question.id in answered_ids,
            )
            for sq in session.session_questions
        ],
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=QuizSessionOut)
def create_quiz(body: QuizCreateRequest, user: CurrentUser, db: DbDep) -> QuizSessionOut:
    try:
        session = quiz_service.create_session(
            db,
            user,
            mode=body.mode,
            question_count=body.question_count,
            testament=body.testament,
            category_ids=body.category_ids,
            difficulty=body.difficulty,
            theme=body.theme,
            timer_seconds=body.timer_seconds,
        )
    except QuizError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return _session_out(quiz_service.get_session_for_user(db, user, session.id))


HISTORY_LIMIT = 5  # hard cap — the dashboard shows at most 5 recent quizzes


@router.get("", response_model=list[QuizHistoryItem])
def quiz_history(user: CurrentUser, db: DbDep, limit: int = HISTORY_LIMIT) -> list[QuizHistoryItem]:
    sessions = quiz_service.recent_sessions(db, user, limit=min(limit, HISTORY_LIMIT))
    return [
        QuizHistoryItem(
            id=s.id,
            mode=s.mode,
            completed_at=s.completed_at,
            correct_count=s.correct_count,
            question_count=s.question_count,
            xp_earned=s.xp_earned,
            duration_seconds=s.duration_seconds,
            filters=quiz_service.session_filters(s),
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=QuizSessionOut)
def get_quiz(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> QuizSessionOut:
    try:
        session = quiz_service.get_session_for_user(db, user, session_id)
    except QuizError as error:
        raise HTTPException(error.status_code, error.message) from error
    return _session_out(session)


@router.post("/{session_id}/answers", response_model=AnswerFeedback)
def submit_answer(
    session_id: uuid.UUID, body: AnswerRequest, user: CurrentUser, db: DbDep
) -> AnswerFeedback:
    try:
        result = quiz_service.submit_answer(
            db,
            user,
            session_id,
            question_id=body.question_id,
            selected_option_id=body.selected_option_id,
            answer_text=body.answer_text,
            time_spent_seconds=body.time_spent_seconds,
            timed_out=body.timed_out,
        )
    except QuizError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return AnswerFeedback(
        is_correct=result.is_correct,
        correct_option_id=result.correct_option_id,
        correct_answer=result.correct_answer,
        explanation=result.explanation,
        divergence_note=result.divergence_note,
        reference=_reference(result.question),
        xp_earned=result.xp_earned,
    )


@router.post("/{session_id}/abandon", response_model=QuizAbandonResponse)
def abandon_quiz(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> QuizAbandonResponse:
    try:
        result = quiz_service.abandon_session(db, user, session_id)
    except QuizError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return QuizAbandonResponse(
        answered_count=result.answered_count,
        wrong_count=result.wrong_count,
        xp_penalty=result.xp_penalty,
    )


@router.post("/{session_id}/complete", response_model=QuizCompleteResponse)
def complete_quiz(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> QuizCompleteResponse:
    try:
        result = quiz_service.complete_session(db, user, session_id)
    except QuizError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    session = result.session
    return QuizCompleteResponse(
        correct_count=session.correct_count,
        question_count=session.question_count,
        answered_count=len(session.answers),
        accuracy=result.accuracy,
        xp_earned=session.xp_earned,
        bonus_xp=result.bonus_xp,
        duration_seconds=session.duration_seconds or 0,
        level=LevelInfo(
            current=result.level,
            leveled_up=result.leveled_up,
            xp_into_level=result.xp_into_level,
            xp_for_next=result.xp_for_next_level,
        ),
        streak=StreakInfo(
            current=result.streak.current, extended_today=result.streak.extended_today
        ),
        daily_goal=DailyGoalInfo(
            target=result.daily_goal_target,
            earned_today=result.daily_goal_earned,
            achieved=result.daily_goal_earned >= result.daily_goal_target,
        ),
        unlocked_achievements=[
            UnlockedAchievement(code=a.code, name=a.name, description=a.description, icon=a.icon)
            for a in result.unlocked_achievements
        ],
    )

"""1v1 duels — asynchronous: both sides answer the SAME frozen questions.

Each side plays a regular QuizSession (mode=duel), so duel answers feed accuracy,
category performance, spaced repetition and streaks like any other study session.
The duel adds only the head-to-head result and its XP stake on top.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Duel, Question, QuizAnswer, QuizSession, QuizSessionQuestion, User, UserStats
from app.models.enums import DuelMode, DuelStatus, QuestionType, QuizMode
from app.services import achievement_service, friendship_service
from app.services.gamification import (
    level_from_total_xp,
    today_for_user,
    upsert_daily_activity,
)

QUESTION_COUNT = 10
TIMER_SECONDS = 20
EXPIRES_IN_HOURS = 48

DUEL_XP = {"win": 50, "draw": 10, "loss": -25}


class DuelError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


# --- creation ---


def _draw_question_ids(db: Session) -> list[uuid.UUID]:
    """Neutral draw: all categories, all difficulties, equal for both players.

    Multiple choice only — with a 30s clock, typing speed would decide open
    answers as much as knowledge does.
    """
    ids = list(
        db.scalars(
            select(Question.id)
            .where(Question.is_active, Question.type == QuestionType.MULTIPLE_CHOICE)
            .order_by(func.random())
            .limit(QUESTION_COUNT)
        )
    )
    if len(ids) < QUESTION_COUNT:
        raise DuelError("Não há perguntas suficientes para um duelo")
    return ids


def _create_session(db: Session, user_id: uuid.UUID, question_ids: list[uuid.UUID]) -> QuizSession:
    session = QuizSession(
        user_id=user_id,
        mode=QuizMode.DUEL,
        question_count=len(question_ids),
        filters={"timer_seconds": TIMER_SECONDS, "duel": True},
    )
    db.add(session)
    db.flush()
    for position, question_id in enumerate(question_ids):
        db.add(
            QuizSessionQuestion(session_id=session.id, question_id=question_id, position=position)
        )
    db.flush()
    return session


def _duel_question_ids(db: Session, duel: Duel) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(QuizSessionQuestion.question_id)
            .where(QuizSessionQuestion.session_id == duel.challenger_session_id)
            .order_by(QuizSessionQuestion.position)
        )
    )


def create_duel(db: Session, me: User, *, opponent_username: str | None = None) -> Duel:
    """Challenge a friend, or join/open the random queue."""
    if opponent_username:
        return _create_friend_duel(db, me, opponent_username)
    return _join_or_open_random(db, me)


def _create_friend_duel(db: Session, me: User, opponent_username: str) -> Duel:
    opponent = friendship_service.find_by_username(db, opponent_username)
    if opponent is None:
        raise DuelError("Usuário não encontrado", status_code=404)
    if opponent.id == me.id:
        raise DuelError("Você não pode duelar consigo mesmo")
    if not friendship_service.are_friends(db, me.id, opponent.id):
        raise DuelError("Vocês precisam ser amigos para duelar")

    question_ids = _draw_question_ids(db)
    duel = Duel(
        mode=DuelMode.FRIEND,
        status=DuelStatus.ACTIVE,
        challenger_id=me.id,
        challenger_session_id=_create_session(db, me.id, question_ids).id,
        opponent_id=opponent.id,
        opponent_session_id=_create_session(db, opponent.id, question_ids).id,
        expires_at=datetime.now(UTC) + timedelta(hours=EXPIRES_IN_HOURS),
    )
    db.add(duel)
    db.flush()
    return duel


def _join_or_open_random(db: Session, me: User) -> Duel:
    """Takes the oldest duel waiting in the queue, or opens one.

    SKIP LOCKED keeps two simultaneous joiners from grabbing the same duel.
    """
    now = datetime.now(UTC)
    waiting = db.scalars(
        select(Duel)
        .where(
            Duel.status == DuelStatus.OPEN,
            Duel.mode == DuelMode.RANDOM,
            Duel.challenger_id != me.id,
            Duel.expires_at > now,
        )
        .order_by(Duel.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    ).first()

    if waiting is not None:
        waiting.opponent_id = me.id
        waiting.opponent_session_id = _create_session(db, me.id, _duel_question_ids(db, waiting)).id
        waiting.status = DuelStatus.ACTIVE
        db.flush()
        return waiting

    question_ids = _draw_question_ids(db)
    duel = Duel(
        mode=DuelMode.RANDOM,
        status=DuelStatus.OPEN,
        challenger_id=me.id,
        challenger_session_id=_create_session(db, me.id, question_ids).id,
        expires_at=now + timedelta(hours=EXPIRES_IN_HOURS),
    )
    db.add(duel)
    db.flush()
    return duel


# --- reading ---


def get_duel(db: Session, duel_id: uuid.UUID) -> Duel | None:
    return db.scalar(
        select(Duel)
        .where(Duel.id == duel_id)
        .options(
            selectinload(Duel.challenger).selectinload(User.stats),
            selectinload(Duel.opponent).selectinload(User.stats),
            selectinload(Duel.challenger_session),
            selectinload(Duel.opponent_session),
        )
    )


def get_duel_for_user(db: Session, me: User, duel_id: uuid.UUID) -> Duel:
    duel = get_duel(db, duel_id)
    if duel is None or me.id not in (duel.challenger_id, duel.opponent_id):
        raise DuelError("Duelo não encontrado", status_code=404)
    return resolve_if_due(db, duel)


def duel_for_session(db: Session, session_id: uuid.UUID) -> Duel | None:
    return db.scalar(
        select(Duel).where(
            (Duel.challenger_session_id == session_id) | (Duel.opponent_session_id == session_id)
        )
    )


def list_duels(db: Session, me: User, limit: int = 20) -> list[Duel]:
    duels = db.scalars(
        select(Duel)
        .where((Duel.challenger_id == me.id) | (Duel.opponent_id == me.id))
        .options(
            selectinload(Duel.challenger).selectinload(User.stats),
            selectinload(Duel.opponent).selectinload(User.stats),
            selectinload(Duel.challenger_session),
            selectinload(Duel.opponent_session),
        )
        .order_by(Duel.created_at.desc())
        .limit(limit)
    ).all()
    return [resolve_if_due(db, duel) for duel in duels]


@dataclass
class SideScore:
    user: User | None
    session: QuizSession | None
    correct: int
    answered: int
    finished: bool
    time_seconds: int


def side_scores(db: Session, duel: Duel) -> tuple[SideScore, SideScore]:
    def score(user: User | None, session: QuizSession | None) -> SideScore:
        if session is None:
            return SideScore(user, None, 0, 0, False, 0)
        answered = (
            db.scalar(
                select(func.count())
                .select_from(QuizAnswer)
                .where(QuizAnswer.session_id == session.id)
            )
            or 0
        )
        return SideScore(
            user=user,
            session=session,
            correct=session.correct_count,
            answered=answered,
            finished=session.completed_at is not None or session.abandoned_at is not None,
            time_seconds=session.duration_seconds or 0,
        )

    return (
        score(duel.challenger, duel.challenger_session),
        score(duel.opponent, duel.opponent_session),
    )


# --- resolution ---


def _apply_result(db: Session, user_id: uuid.UUID, outcome: str) -> None:
    stats = db.get(UserStats, user_id)
    user = db.get(User, user_id)
    if stats is None or user is None:
        return
    if outcome == "win":
        stats.duel_wins += 1
        stats.current_duel_streak += 1
        stats.best_duel_streak = max(stats.best_duel_streak, stats.current_duel_streak)
    elif outcome == "loss":
        stats.duel_losses += 1
        stats.current_duel_streak = 0
    else:
        stats.duel_draws += 1
    # Lifetime XP never drops below zero (same floor as practice sessions).
    stats.total_xp = max(0, stats.total_xp + DUEL_XP[outcome])
    stats.level, _, _ = level_from_total_xp(stats.total_xp)
    # Duel rounds pay no per-answer XP, so the stake is what reaches the daily goal.
    upsert_daily_activity(
        db,
        user_id,
        today_for_user(user),
        xp=DUEL_XP[outcome],
        questions=0,
        correct=0,
        time_seconds=0,
    )
    db.flush()
    # Duel results land after complete_session already evaluated achievements,
    # so re-check here or duel badges would only unlock on the next session.
    achievement_service.evaluate_achievements(db, user, stats)


def resolve_if_due(db: Session, duel: Duel) -> Duel:
    """Finishes the duel when both rounds are done, or when the deadline passes."""
    if duel.status in (DuelStatus.FINISHED, DuelStatus.EXPIRED):
        return duel

    challenger, opponent = side_scores(db, duel)
    expired = duel.expires_at <= datetime.now(UTC)

    if duel.opponent_id is None:
        # Nobody ever joined the queue entry.
        if expired:
            duel.status = DuelStatus.EXPIRED
            duel.resolved_at = datetime.now(UTC)
            db.flush()
        return duel

    both_done = challenger.finished and opponent.finished
    if not both_done and not expired:
        return duel

    if expired and not challenger.finished and not opponent.finished:
        # Neither side showed up — no winner, no XP moved.
        duel.status = DuelStatus.EXPIRED
        duel.resolved_at = datetime.now(UTC)
        db.flush()
        return duel

    # On expiry, whoever did not play forfeits their unanswered round.
    winner_id: uuid.UUID | None = None
    is_draw = False
    if challenger.correct > opponent.correct:
        winner_id = duel.challenger_id
    elif opponent.correct > challenger.correct:
        winner_id = duel.opponent_id
    elif challenger.finished != opponent.finished:
        winner_id = duel.challenger_id if challenger.finished else duel.opponent_id
    elif challenger.time_seconds != opponent.time_seconds and challenger.finished:
        # Same score: the faster round wins.
        winner_id = (
            duel.challenger_id
            if challenger.time_seconds < opponent.time_seconds
            else duel.opponent_id
        )
    else:
        is_draw = True

    duel.status = DuelStatus.FINISHED
    duel.winner_id = winner_id
    duel.is_draw = is_draw
    duel.resolved_at = datetime.now(UTC)

    if is_draw:
        _apply_result(db, duel.challenger_id, "draw")
        _apply_result(db, duel.opponent_id, "draw")
    else:
        loser_id = duel.opponent_id if winner_id == duel.challenger_id else duel.challenger_id
        _apply_result(db, winner_id, "win")  # type: ignore[arg-type]
        _apply_result(db, loser_id, "loss")
    db.flush()
    return duel


def resolve_for_session(db: Session, session_id: uuid.UUID) -> Duel | None:
    """Called after a quiz session completes, in case it was a duel round."""
    duel = duel_for_session(db, session_id)
    if duel is None:
        return None
    return resolve_if_due(db, get_duel(db, duel.id) or duel)


def my_side(duel: Duel, me: User) -> str:
    return "challenger" if duel.challenger_id == me.id else "opponent"


def session_id_for(duel: Duel, me: User) -> uuid.UUID | None:
    return duel.challenger_session_id if duel.challenger_id == me.id else duel.opponent_session_id

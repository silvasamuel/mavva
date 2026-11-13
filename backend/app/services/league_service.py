"""Private leagues: invite-only competitions over a chosen slice of the bank.

A league is created by a supporter, who invites players by username. Once it
starts nobody else joins and the fixtures are drawn:

- points: N rounds; every member plays each one (in order) and the most
  points by the end date wins;
- cup: a knockout bracket of 1v1 matches, drawn at random at the start.

Every fixture freezes its questions, so everyone who plays it answers the
same ones, each in their own QuizSession (mode `league`). Reusing QuizSession
means league answers feed accuracy, wisdom, spaced repetition and streaks
like any other study, but they pay no season XP: only supporters can play, and
the global ranking must not be something a donation can move.

The end date is enforced lazily, like seasons: whoever looks at a league
after it has passed closes it (see `ensure_closed`).
"""

import random
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Category,
    League,
    LeagueEntry,
    LeagueMatch,
    LeagueMember,
    Question,
    QuizAnswer,
    QuizSession,
    QuizSessionQuestion,
    User,
)
from app.models.enums import (
    Difficulty,
    LeagueFormat,
    LeagueMemberStatus,
    LeagueStatus,
    QuizMode,
)
from app.services.gamification import XP_BY_DIFFICULTY

QUESTION_COUNT = 10
TIMER_SECONDS = 20
MAX_MEMBERS = 20
MIN_CATEGORIES = 7
MIN_ROUNDS = 1
MAX_ROUNDS = 30
MAX_DAYS_AHEAD = 365
# Leagues one player may be running (recruiting or active) at the same time.
MAX_OWNED_OPEN = 5
# A round nobody can be faster than: what an abandoned session is charged.
FULL_ROUND_SECONDS = QUESTION_COUNT * TIMER_SECONDS

LEAGUE_TZ = ZoneInfo("America/Sao_Paulo")

OPEN_STATUSES = (LeagueStatus.RECRUITING, LeagueStatus.ACTIVE)


class LeagueError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(UTC)


def league_today() -> date:
    return _now().astimezone(LEAGUE_TZ).date()


def ends_at_for(ends_on: date) -> datetime:
    """The league's last day runs to midnight in Brasília."""
    return datetime.combine(ends_on + timedelta(days=1), time.min, LEAGUE_TZ).astimezone(UTC)


def ends_on_of(league: League) -> date:
    return (league.ends_at.astimezone(LEAGUE_TZ) - timedelta(seconds=1)).date()


def require_supporter(user: User) -> None:
    if not user.is_supporter:
        raise LeagueError(
            "As ligas são para Mavva Apoiadores. Apoie o Mavva para criar e jogar.", status_code=403
        )


# --- loading -------------------------------------------------------------------


def _load(db: Session, league_id: uuid.UUID) -> League | None:
    return db.scalar(
        select(League)
        .where(League.id == league_id)
        .options(
            selectinload(League.members).selectinload(LeagueMember.user).selectinload(User.stats),
            selectinload(League.matches).selectinload(LeagueMatch.entries),
            selectinload(League.owner),
            selectinload(League.champion).selectinload(User.stats),
        )
        .execution_options(populate_existing=True)
    )


def membership(league: League, user_id: uuid.UUID) -> LeagueMember | None:
    return next((m for m in league.members if m.user_id == user_id), None)


def active_members(league: League) -> list[LeagueMember]:
    return [m for m in league.members if m.status == LeagueMemberStatus.ACTIVE]


def get_league_for_user(db: Session, user: User, league_id: uuid.UUID) -> League:
    """A league is private: only its players and the people invited may see it."""
    league = _load(db, league_id)
    member = membership(league, user.id) if league else None
    if (
        league is None
        or member is None
        or member.status not in (LeagueMemberStatus.ACTIVE, LeagueMemberStatus.INVITED)
    ):
        raise LeagueError("Liga não encontrada", status_code=404)
    if ensure_closed(db, league):
        db.flush()
    return league


def list_for_user(db: Session, user: User) -> list[League]:
    """Every league the player is in or invited to, newest first."""
    ids = list(
        db.scalars(
            select(LeagueMember.league_id).where(
                LeagueMember.user_id == user.id,
                LeagueMember.status.in_([LeagueMemberStatus.ACTIVE, LeagueMemberStatus.INVITED]),
            )
        )
    )
    leagues = [league for league in (_load(db, league_id) for league_id in ids) if league]
    for league in leagues:
        ensure_closed(db, league)
    db.flush()
    leagues.sort(key=lambda league: league.created_at, reverse=True)
    return leagues


# --- creation and membership -----------------------------------------------------


def _pool(db: Session, category_ids: list[int], difficulties: list[str]) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(Question.id).where(
                Question.is_active,
                Question.category_id.in_(category_ids),
                Question.difficulty.in_([Difficulty(value) for value in difficulties]),
            )
        )
    )


def create_league(
    db: Session,
    owner: User,
    *,
    name: str,
    format: LeagueFormat,
    category_ids: list[int],
    difficulties: list[Difficulty],
    rounds: int | None,
    ends_on: date,
) -> League:
    require_supporter(owner)
    categories = sorted(set(category_ids))
    if len(categories) < MIN_CATEGORIES:
        raise LeagueError(f"Escolha pelo menos {MIN_CATEGORIES} temas")
    known = db.scalar(select(func.count()).select_from(Category).where(Category.id.in_(categories)))
    if known != len(categories):
        raise LeagueError("Um dos temas escolhidos não existe")
    levels = sorted({difficulty.value for difficulty in difficulties})
    if not levels:
        raise LeagueError("Escolha pelo menos uma dificuldade")

    if format == LeagueFormat.POINTS:
        if rounds is None or not MIN_ROUNDS <= rounds <= MAX_ROUNDS:
            raise LeagueError(f"Escolha de {MIN_ROUNDS} a {MAX_ROUNDS} rodadas")
    else:
        rounds = None

    today = league_today()
    if ends_on <= today:
        raise LeagueError("A data de encerramento precisa ser a partir de amanhã")
    if ends_on > today + timedelta(days=MAX_DAYS_AHEAD):
        raise LeagueError("A data de encerramento pode ser no máximo daqui a um ano")

    if len(_pool(db, categories, levels)) < QUESTION_COUNT:
        raise LeagueError("Há poucas perguntas com esses temas e dificuldades. Amplie a seleção.")

    running = db.scalar(
        select(func.count())
        .select_from(League)
        .where(League.owner_id == owner.id, League.status.in_(OPEN_STATUSES))
    )
    if (running or 0) >= MAX_OWNED_OPEN:
        raise LeagueError(
            f"Você já tem {MAX_OWNED_OPEN} ligas em aberto. Encerre uma antes de criar outra."
        )

    league = League(
        owner_id=owner.id,
        name=name,
        format=format,
        status=LeagueStatus.RECRUITING,
        category_ids=categories,
        difficulties=levels,
        rounds=rounds,
        ends_at=ends_at_for(ends_on),
    )
    league.members.append(
        LeagueMember(user_id=owner.id, status=LeagueMemberStatus.ACTIVE, joined_at=_now())
    )
    db.add(league)
    db.flush()
    return league


def _require_owner(league: League, user: User) -> None:
    if league.owner_id != user.id:
        raise LeagueError("Só quem criou a liga pode fazer isso", status_code=403)


def _require_recruiting(league: League) -> None:
    if league.status != LeagueStatus.RECRUITING:
        raise LeagueError("A liga já começou: os jogadores não mudam mais")


def invite(db: Session, owner: User, league: League, username: str) -> LeagueMember:
    _require_owner(league, owner)
    _require_recruiting(league)
    target = db.scalar(
        select(User).where(User.username == username.strip().lower(), User.is_active.is_(True))
    )
    if target is None:
        raise LeagueError("Jogador não encontrado", status_code=404)
    if target.id == owner.id:
        raise LeagueError("Você já está na sua liga")

    existing = membership(league, target.id)
    if existing is not None and existing.status == LeagueMemberStatus.ACTIVE:
        raise LeagueError("Esse jogador já está na liga")
    if existing is not None and existing.status == LeagueMemberStatus.INVITED:
        raise LeagueError("Esse jogador já foi convidado")

    holding = sum(
        1
        for m in league.members
        if m.status in (LeagueMemberStatus.ACTIVE, LeagueMemberStatus.INVITED)
    )
    if holding >= MAX_MEMBERS:
        raise LeagueError(f"Uma liga tem no máximo {MAX_MEMBERS} jogadores, convites inclusos")

    if existing is not None:
        # Declined or left before: the owner may ask again.
        existing.status = LeagueMemberStatus.INVITED
        existing.invited_at = _now()
        existing.joined_at = None
        member = existing
    else:
        member = LeagueMember(user_id=target.id, status=LeagueMemberStatus.INVITED)
        league.members.append(member)
    db.flush()
    return member


def join(db: Session, user: User, league: League) -> LeagueMember:
    member = membership(league, user.id)
    if member is None or member.status != LeagueMemberStatus.INVITED:
        raise LeagueError("Você não tem convite para esta liga", status_code=404)
    _require_recruiting(league)
    require_supporter(user)
    if len(active_members(league)) >= MAX_MEMBERS:
        raise LeagueError(f"A liga já tem {MAX_MEMBERS} jogadores")
    member.status = LeagueMemberStatus.ACTIVE
    member.joined_at = _now()
    db.flush()
    return member


def decline(db: Session, user: User, league: League) -> None:
    member = membership(league, user.id)
    if member is None or member.status != LeagueMemberStatus.INVITED:
        raise LeagueError("Você não tem convite para esta liga", status_code=404)
    member.status = LeagueMemberStatus.DECLINED
    db.flush()


def leave(db: Session, user: User, league: League) -> None:
    member = membership(league, user.id)
    if member is None or member.status != LeagueMemberStatus.ACTIVE:
        raise LeagueError("Você não está nesta liga", status_code=404)
    if league.owner_id == user.id:
        raise LeagueError("Quem criou a liga não pode sair dela; apague a liga")
    _require_recruiting(league)
    member.status = LeagueMemberStatus.LEFT
    db.flush()


def remove_member(db: Session, owner: User, league: League, user_id: uuid.UUID) -> None:
    """Takes a player out, or withdraws an invite, while the league is recruiting."""
    _require_owner(league, owner)
    _require_recruiting(league)
    if user_id == owner.id:
        raise LeagueError("Quem criou a liga não pode ser removido")
    member = membership(league, user_id)
    if member is None:
        raise LeagueError("Esse jogador não está na liga", status_code=404)
    league.members.remove(member)
    db.flush()


def delete_league(db: Session, owner: User, league: League) -> None:
    _require_owner(league, owner)
    if league.status != LeagueStatus.RECRUITING:
        raise LeagueError("Uma liga que já começou não pode ser apagada")
    db.delete(league)
    db.flush()


# --- starting: the draw ----------------------------------------------------------


class _Deck:
    """Hands out question sets, going through the whole pool before repeating."""

    def __init__(self, pool: list[uuid.UUID], rng: random.Random) -> None:
        self._pool = pool
        self._rng = rng
        self._queue: list[uuid.UUID] = []

    def draw(self) -> list[str]:
        hand: list[uuid.UUID] = []
        while len(hand) < QUESTION_COUNT:
            if not self._queue:
                self._queue = [q for q in self._pool if q not in hand]
                self._rng.shuffle(self._queue)
            hand.append(self._queue.pop())
        return [str(question_id) for question_id in hand]


@dataclass
class _Seat:
    """Who sits on one side of a cup match: a player, or the winner of a match."""

    player_id: uuid.UUID | None = None
    match: LeagueMatch | None = None


def build_bracket(player_ids: list[uuid.UUID], draw_questions) -> list[LeagueMatch]:  # type: ignore[no-untyped-def]
    """The whole knockout tree for players already in drawn order.

    Round 1 pairs everybody (the count is even). After that the winners pair
    up in order; when a round has an odd number of entrants the last one gets
    a bye, and goes to the front of the next round so the same seat never
    rests twice in a row.
    """
    matches: list[LeagueMatch] = []
    seats = [_Seat(player_id=player_id) for player_id in player_ids]
    round_number = 1
    while len(seats) > 1:
        resting = seats.pop() if len(seats) % 2 else None
        winners: list[_Seat] = []
        for index in range(0, len(seats), 2):
            a, b = seats[index], seats[index + 1]
            match = LeagueMatch(
                id=uuid.uuid4(),
                round=round_number,
                position=index // 2 + 1,
                question_ids=draw_questions(),
                player_a_id=a.player_id,
                player_b_id=b.player_id,
                feeder_a_id=a.match.id if a.match else None,
                feeder_b_id=b.match.id if b.match else None,
            )
            matches.append(match)
            winners.append(_Seat(match=match))
        seats = ([resting] if resting else []) + winners
        round_number += 1
    return matches


def start(db: Session, owner: User, league: League, rng: random.Random | None = None) -> League:
    _require_owner(league, owner)
    _require_recruiting(league)
    if league.ends_at <= _now():
        raise LeagueError("A data de encerramento desta liga já passou")
    players = active_members(league)
    if len(players) < 2:
        raise LeagueError("Uma liga precisa de pelo menos 2 jogadores para começar")
    if league.format == LeagueFormat.CUP and len(players) % 2:
        raise LeagueError(
            "A copa precisa de um número par de jogadores. Convide mais um ou remova alguém."
        )
    pool = _pool(db, league.category_ids, league.difficulties)
    if len(pool) < QUESTION_COUNT:
        raise LeagueError("Não há perguntas suficientes para os temas desta liga")

    rng = rng or random.Random()
    deck = _Deck(pool, rng)
    # Invites nobody answered lapse: from here on the players are fixed.
    for member in [m for m in league.members if m.status == LeagueMemberStatus.INVITED]:
        league.members.remove(member)

    if league.format == LeagueFormat.POINTS:
        for round_number in range(1, (league.rounds or 1) + 1):
            league.matches.append(
                LeagueMatch(round=round_number, position=1, question_ids=deck.draw())
            )
    else:
        order = [m.user_id for m in players]
        rng.shuffle(order)
        # Round by round: a match must exist before a later one can name it
        # as its feeder.
        for match in build_bracket(order, deck.draw):
            league.matches.append(match)
            db.flush()

    league.status = LeagueStatus.ACTIVE
    league.started_at = _now()
    db.flush()
    return league


# --- playing ---------------------------------------------------------------------


def _entry(match: LeagueMatch, user_id: uuid.UUID) -> LeagueEntry | None:
    return next((e for e in match.entries if e.user_id == user_id), None)


def _is_cup_player(match: LeagueMatch, user_id: uuid.UUID) -> bool:
    return user_id in (match.player_a_id, match.player_b_id)


def playable_match(league: League, user: User) -> LeagueMatch | None:
    """The fixture the player should play next, if there is one right now."""
    if league.status != LeagueStatus.ACTIVE or league.ends_at <= _now():
        return None
    member = membership(league, user.id)
    if member is None or member.status != LeagueMemberStatus.ACTIVE:
        return None
    for match in league.matches:
        entry = _entry(match, user.id)
        if entry is not None and entry.finished_at is not None:
            continue
        if league.format == LeagueFormat.POINTS:
            return match  # rounds go in order: the first one not finished
        if (
            _is_cup_player(match, user.id)
            and match.resolved_at is None
            and match.player_a_id is not None
            and match.player_b_id is not None
        ):
            return match
    return None


def play(db: Session, user: User, league: League, match_id: uuid.UUID) -> QuizSession:
    """Opens (or resumes) the player's session for a fixture."""
    require_supporter(user)
    if league.status != LeagueStatus.ACTIVE:
        raise LeagueError("Esta liga não está em andamento")
    match = next((m for m in league.matches if m.id == match_id), None)
    if match is None:
        raise LeagueError("Partida não encontrada", status_code=404)
    member = membership(league, user.id)
    if member is None or member.status != LeagueMemberStatus.ACTIVE:
        raise LeagueError("Você não joga nesta liga", status_code=403)

    entry = _entry(match, user.id)
    if entry is not None and entry.finished_at is not None:
        raise LeagueError("Você já jogou esta partida")
    if entry is not None:
        return entry.session  # reload or second device: same session

    if league.format == LeagueFormat.CUP:
        if not _is_cup_player(match, user.id):
            raise LeagueError("Esta partida não é sua", status_code=403)
        if match.player_a_id is None or match.player_b_id is None:
            raise LeagueError("O adversário desta partida ainda não foi definido")
        if match.resolved_at is not None:
            raise LeagueError("Esta partida já foi decidida")
    else:
        expected = playable_match(league, user)
        if expected is None or expected.id != match.id:
            raise LeagueError("Jogue as rodadas em ordem")

    question_ids = [uuid.UUID(value) for value in match.question_ids]
    session = QuizSession(
        user_id=user.id,
        mode=QuizMode.LEAGUE,
        question_count=len(question_ids),
        filters={
            "timer_seconds": TIMER_SECONDS,
            "league_id": str(league.id),
            "league_match_id": str(match.id),
        },
    )
    db.add(session)
    db.flush()
    for position, question_id in enumerate(question_ids):
        db.add(
            QuizSessionQuestion(session_id=session.id, question_id=question_id, position=position)
        )
    match.entries.append(LeagueEntry(user_id=user.id, session_id=session.id))
    db.flush()
    return session


def league_id_for_session(session: QuizSession) -> uuid.UUID | None:
    value = (session.filters or {}).get("league_id")
    return uuid.UUID(value) if value else None


def _session_points(db: Session, session_id: uuid.UUID) -> int:
    """League points: each correct answer is worth its difficulty (10 to 50)."""
    difficulties = db.scalars(
        select(Question.difficulty)
        .join(QuizAnswer, QuizAnswer.question_id == Question.id)
        .where(QuizAnswer.session_id == session_id, QuizAnswer.is_correct.is_(True))
    )
    return sum(XP_BY_DIFFICULTY[difficulty] for difficulty in difficulties)


def settle_for_session(db: Session, session_id: uuid.UUID) -> League | None:
    """Called when a quiz session ends (completed or abandoned): records the
    score if it was a league fixture and moves the league forward."""
    entry = db.scalar(select(LeagueEntry).where(LeagueEntry.session_id == session_id))
    if entry is None or entry.finished_at is not None:
        return None
    session = db.get(QuizSession, session_id)
    if session is None or (session.completed_at is None and session.abandoned_at is None):
        return None

    entry.points = _session_points(db, session_id)
    entry.correct = session.correct_count
    # Walking out is never faster than playing: it is charged the full clock.
    entry.time_seconds = (
        session.duration_seconds
        if session.completed_at is not None and session.duration_seconds is not None
        else FULL_ROUND_SECONDS
    )
    entry.finished_at = _now()
    db.flush()

    match = db.get(LeagueMatch, entry.match_id)
    league = _load(db, match.league_id) if match else None
    if league is None or league.status != LeagueStatus.ACTIVE:
        return league
    match = next(m for m in league.matches if m.id == entry.match_id)
    if league.format == LeagueFormat.CUP:
        _resolve_cup_match(league, match)
    elif _all_rounds_played(league):
        _finish_points(league)
    db.flush()
    return league


def _resolve_cup_match(
    league: League, match: LeagueMatch, rng: random.Random | None = None
) -> None:
    if match.resolved_at is not None:
        return
    a = _entry(match, match.player_a_id) if match.player_a_id else None
    b = _entry(match, match.player_b_id) if match.player_b_id else None
    if a is None or b is None or a.finished_at is None or b.finished_at is None:
        return

    if a.points != b.points:
        winner, decided_by = (a if a.points > b.points else b), "points"
    elif a.time_seconds != b.time_seconds:
        winner, decided_by = (a if a.time_seconds < b.time_seconds else b), "time"
    else:
        # A bracket needs someone to advance: a dead heat is drawn at random.
        winner, decided_by = (rng or random.Random()).choice([a, b]), "lots"

    match.winner_id = winner.user_id
    match.decided_by = decided_by
    match.resolved_at = _now()

    advanced = False
    for later in league.matches:
        if later.feeder_a_id == match.id:
            later.player_a_id = winner.user_id
            advanced = True
        if later.feeder_b_id == match.id:
            later.player_b_id = winner.user_id
            advanced = True
    if not advanced:
        # Nothing waits for this winner: it was the final.
        league.status = LeagueStatus.FINISHED
        league.champion_id = winner.user_id
        league.finished_at = _now()


def _all_rounds_played(league: League) -> bool:
    players = {m.user_id for m in active_members(league)}
    return all(
        players <= {e.user_id for e in match.entries if e.finished_at is not None}
        for match in league.matches
    )


def _finish_points(league: League) -> None:
    table = standings(league)
    leader = table[0] if table and table[0].played > 0 else None
    league.finished_at = _now()
    if leader is None:
        league.status = LeagueStatus.INCOMPLETE
        return
    league.status = LeagueStatus.FINISHED
    league.champion_id = leader.user_id


def ensure_closed(db: Session, league: League) -> bool:
    """Applies the end date. Returns whether the league changed.

    A points league crowns whoever leads at that moment. A cup whose final
    was not played, and a league that never started, end as incomplete.
    """
    if league.status not in OPEN_STATUSES or league.ends_at > _now():
        return False
    if league.status == LeagueStatus.ACTIVE and league.format == LeagueFormat.POINTS:
        _finish_points(league)
    else:
        league.status = LeagueStatus.INCOMPLETE
        league.finished_at = _now()
    return True


# --- standings -------------------------------------------------------------------


@dataclass
class Standing:
    user_id: uuid.UUID
    username: str
    points: int = 0
    correct: int = 0
    time_seconds: int = 0
    played: int = 0  # fixtures finished
    wins: int = 0  # cup only
    reach: int = 0  # cup only: how far in the bracket (round number, +1 for winning it)
    eliminated: bool = False  # cup only
    position: int = field(default=0)


def standings(league: League) -> list[Standing]:
    """The league's own ranking.

    Points: most points, then least time. Cup: how far each player got in the
    bracket, then points scored along the way.
    """
    rows = {
        m.user_id: Standing(user_id=m.user_id, username=m.user.username)
        for m in active_members(league)
    }
    for match in league.matches:
        for entry in match.entries:
            row = rows.get(entry.user_id)
            if row is None or entry.finished_at is None:
                continue
            row.points += entry.points
            row.correct += entry.correct
            row.time_seconds += entry.time_seconds
            row.played += 1
        if league.format != LeagueFormat.CUP:
            continue
        for player_id in (match.player_a_id, match.player_b_id):
            row = rows.get(player_id) if player_id else None
            if row is None:
                continue
            won = match.winner_id == player_id
            row.reach = max(row.reach, match.round + (1 if won else 0))
            if match.resolved_at is not None:
                if won:
                    row.wins += 1
                else:
                    row.eliminated = True

    if league.format == LeagueFormat.CUP:
        ordered = sorted(
            rows.values(),
            key=lambda r: (
                r.user_id != league.champion_id,
                -r.reach,
                -r.points,
                r.time_seconds,
                r.username,
            ),
        )
    else:
        ordered = sorted(rows.values(), key=lambda r: (-r.points, r.time_seconds, r.username))
    for index, row in enumerate(ordered, start=1):
        row.position = index
    return ordered


def pending_count(db: Session, user: User) -> int:
    """Badge for the menu: invites waiting plus leagues where it's the player's turn."""
    count = 0
    for league in list_for_user(db, user):
        member = membership(league, user.id)
        if member is None:
            continue
        if member.status == LeagueMemberStatus.INVITED:
            count += league.status == LeagueStatus.RECRUITING
        elif playable_match(league, user) is not None:
            count += 1
    return count

"""Ligas: private, invite-only competitions (points table or knockout cup)."""

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.v1.social import _require_public
from app.core.deps import CurrentUser, DbDep
from app.core.ratelimit import limiter
from app.models import Category, League, LeagueMatch, User
from app.models.enums import Difficulty, LeagueFormat, LeagueMemberStatus, LeagueStatus
from app.schemas.league import (
    LeagueCategoryOut,
    LeagueCreate,
    LeagueCupMatchOut,
    LeagueCupRoundOut,
    LeagueDetailOut,
    LeagueInviteIn,
    LeagueInvitePreviewOut,
    LeagueInviteRedeemOut,
    LeagueListOut,
    LeagueMemberOut,
    LeagueOut,
    LeaguePlayOut,
    LeagueRoundOut,
    LeagueScoreOut,
    LeagueSideOut,
    LeagueStandingOut,
)
from app.services import league_service
from app.services.league_service import LeagueError
from app.services.rate_limit_service import enforce_user_limit

router = APIRouter(prefix="/leagues", tags=["leagues"])


def _fail(error: LeagueError) -> HTTPException:
    return HTTPException(error.status_code, error.message)


def _league_out(league: League, me: User) -> LeagueOut:
    member = league_service.membership(league, me.id)
    assert member is not None
    mine = league_service.playable_match(league, me)
    owner = next(m.user for m in league.members if m.user_id == league.owner_id)
    return LeagueOut(
        id=league.id,
        name=league.name,
        format=league.format,
        status=league.status,
        rounds=league.rounds,
        ends_on=league_service.ends_on_of(league),
        ends_at=league.ends_at,
        created_at=league.created_at,
        started_at=league.started_at,
        finished_at=league.finished_at,
        owner=_require_public(owner),
        is_owner=league.owner_id == me.id,
        my_status=member.status,
        member_count=len(league_service.active_members(league)),
        invited_count=sum(1 for m in league.members if m.status == LeagueMemberStatus.INVITED),
        max_members=league_service.MAX_MEMBERS,
        champion=_require_public(league.champion) if league.champion else None,
        my_match_id=mine.id if mine else None,
        my_match_deadline_at=mine.deadline_at if mine else None,
        invite_code=(
            league.invite_code
            if league.owner_id == me.id and league.status == LeagueStatus.RECRUITING
            else None
        ),
    )


def _score(entry) -> LeagueScoreOut:  # type: ignore[no-untyped-def]
    return LeagueScoreOut(
        points=entry.points, correct=entry.correct, time_seconds=entry.time_seconds
    )


def _rounds_out(league: League, me: User) -> list[LeagueRoundOut]:
    rounds = []
    for match in league.matches:
        mine = next((e for e in match.entries if e.user_id == me.id), None)
        rounds.append(
            LeagueRoundOut(
                match_id=match.id,
                round=match.round,
                played_count=sum(1 for e in match.entries if e.finished_at is not None),
                my_score=_score(mine) if mine and mine.finished_at else None,
                in_progress=mine is not None and mine.finished_at is None,
            )
        )
    return rounds


def _round_label(round_number: int, last_round: int, match_count: int) -> str:
    if round_number == last_round:
        return "Final"
    if round_number == last_round - 1 and match_count == 2:
        return "Semifinal"
    return f"Rodada {round_number}"


def _bracket_out(league: League) -> list[LeagueCupRoundOut]:
    users = {m.user_id: m.user for m in league.members}
    matches = league.matches
    number = {match.id: index for index, match in enumerate(matches, start=1)}
    by_id = {match.id: match for match in matches}

    def side(
        match: LeagueMatch, player_id: uuid.UUID | None, feeder_id: uuid.UUID | None
    ) -> LeagueSideOut:
        user = users.get(player_id) if player_id else None
        entry = next((e for e in match.entries if e.user_id == player_id), None)
        feeder = by_id.get(feeder_id) if feeder_id else None
        return LeagueSideOut(
            user=_require_public(user) if user else None,
            from_match=number[feeder_id] if user is None and feeder_id in number else None,
            vacant=user is None and feeder is not None and feeder.resolved_at is not None,
            played=entry is not None and entry.finished_at is not None,
            # Scores stay hidden until both have played: nobody chases a target.
            score=_score(entry) if entry and match.resolved_at is not None else None,
        )

    last_round = max((m.round for m in matches), default=0)
    rounds: list[LeagueCupRoundOut] = []
    for round_number in range(1, last_round + 1):
        here = [m for m in matches if m.round == round_number]
        # A seat fed by a match from two or more rounds back rested in between.
        byes: list[LeagueSideOut] = []
        for later in (m for m in matches if m.round > round_number):
            for feeder_id, player_id in (
                (later.feeder_a_id, later.player_a_id),
                (later.feeder_b_id, later.player_b_id),
            ):
                feeder = by_id.get(feeder_id) if feeder_id else None
                if feeder is not None and feeder.round < round_number:
                    user = users.get(player_id) if player_id else None
                    byes.append(
                        LeagueSideOut(
                            user=_require_public(user) if user else None,
                            from_match=number[feeder.id] if user is None else None,
                            vacant=user is None and feeder.resolved_at is not None,
                            played=False,
                            score=None,
                        )
                    )
        rounds.append(
            LeagueCupRoundOut(
                round=round_number,
                label=_round_label(round_number, last_round, len(here)),
                matches=[
                    LeagueCupMatchOut(
                        id=m.id,
                        number=number[m.id],
                        a=side(m, m.player_a_id, m.feeder_a_id),
                        b=side(m, m.player_b_id, m.feeder_b_id),
                        winner_id=m.winner_id,
                        decided_by=m.decided_by,  # type: ignore[arg-type]
                        deadline_at=m.deadline_at,
                    )
                    for m in here
                ],
                byes=byes,
            )
        )
    return rounds


def _detail_out(db: DbDep, league: League, me: User) -> LeagueDetailOut:
    base = _league_out(league, me)
    users = {m.user_id: m.user for m in league.members}
    categories = db.scalars(
        select(Category).where(Category.id.in_(league.category_ids)).order_by(Category.name)
    ).all()
    visible = [
        m
        for m in league.members
        if m.status in (LeagueMemberStatus.ACTIVE, LeagueMemberStatus.INVITED)
    ]
    visible.sort(
        key=lambda m: (
            m.user_id != league.owner_id,
            m.status != LeagueMemberStatus.ACTIVE,
            m.user.username,
        )
    )
    is_cup = league.format == LeagueFormat.CUP
    return LeagueDetailOut(
        **base.model_dump(),
        can_play=me.is_supporter,
        categories=[
            LeagueCategoryOut(id=c.id, slug=c.slug, name=c.name, icon=c.icon) for c in categories
        ],
        difficulties=[Difficulty(value) for value in league.difficulties],
        question_count=league.question_count,
        timer_seconds=league.timer_seconds,
        members=[
            LeagueMemberOut(
                user=_require_public(m.user),
                status=m.status,
                is_owner=m.user_id == league.owner_id,
            )
            for m in visible
        ],
        standings=[
            LeagueStandingOut(
                position=row.position,
                user=_require_public(users[row.user_id]),
                is_me=row.user_id == me.id,
                points=row.points,
                correct=row.correct,
                time_seconds=row.time_seconds,
                played=row.played,
                wins=row.wins,
                eliminated=row.eliminated,
            )
            for row in league_service.standings(league)
        ],
        rounds_played=[] if is_cup else _rounds_out(league, me),
        bracket=_bracket_out(league) if is_cup else [],
    )


def _mine(db: DbDep, user: User, league_id: uuid.UUID) -> League:
    try:
        return league_service.get_league_for_user(db, user, league_id)
    except LeagueError as error:
        raise _fail(error) from error


@router.get("", response_model=LeagueListOut)
def list_leagues(user: CurrentUser, db: DbDep) -> LeagueListOut:
    leagues = league_service.list_for_user(db, user)
    db.commit()  # the end date may have closed some of them
    return LeagueListOut(
        can_play=user.is_supporter, leagues=[_league_out(league, user) for league in leagues]
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=LeagueDetailOut)
def create_league(body: LeagueCreate, user: CurrentUser, db: DbDep) -> LeagueDetailOut:
    enforce_user_limit(db, user.id, "league_create", limit=10, window_seconds=3600)
    try:
        league = league_service.create_league(
            db,
            user,
            name=body.name,
            format=body.format,
            category_ids=body.category_ids,
            difficulties=body.difficulties,
            rounds=body.rounds,
            ends_on=body.ends_on,
            question_count=body.question_count,
            timer_seconds=body.timer_seconds,
        )
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return _detail_out(db, _mine(db, user, league.id), user)


@router.get("/invite/{code}", response_model=LeagueInvitePreviewOut)
@limiter.limit("60/minute")
def invite_preview(request: Request, code: str, db: DbDep) -> LeagueInvitePreviewOut:
    """Public on purpose: the link is opened before the guest has an account.
    It shows the league and nothing about its players but the admin's name."""
    try:
        league = league_service.invite_preview(db, code)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return LeagueInvitePreviewOut(
        name=league.name,
        format=league.format,
        status=league.status,
        rounds=league.rounds,
        ends_on=league_service.ends_on_of(league),
        admin_name=league.owner.name,
        admin_username=league.owner.username,
        member_count=len(league_service.active_members(league)),
        max_members=league_service.MAX_MEMBERS,
        question_count=league.question_count,
        timer_seconds=league.timer_seconds,
        open=(league.status == LeagueStatus.RECRUITING and league_service.seats_left(league) > 0),
    )


@router.post("/invite/{code}/redeem", response_model=LeagueInviteRedeemOut)
def redeem_invite(code: str, user: CurrentUser, db: DbDep) -> LeagueInviteRedeemOut:
    """Turns the link into an invitation for the caller and says where it is."""
    enforce_user_limit(db, user.id, "league_redeem", limit=30, window_seconds=3600)
    try:
        league = league_service.redeem_invite(db, user, code)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return LeagueInviteRedeemOut(league_id=league.id)


@router.get("/{league_id}", response_model=LeagueDetailOut)
def league_detail(league_id: uuid.UUID, user: CurrentUser, db: DbDep) -> LeagueDetailOut:
    league = _mine(db, user, league_id)
    db.commit()
    return _detail_out(db, league, user)


@router.delete("/{league_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_league(league_id: uuid.UUID, user: CurrentUser, db: DbDep) -> None:
    league = _mine(db, user, league_id)
    try:
        league_service.delete_league(db, user, league)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()


@router.post("/{league_id}/invites", response_model=LeagueDetailOut)
def invite_player(
    league_id: uuid.UUID, body: LeagueInviteIn, user: CurrentUser, db: DbDep
) -> LeagueDetailOut:
    enforce_user_limit(db, user.id, "league_invite", limit=60, window_seconds=3600)
    league = _mine(db, user, league_id)
    try:
        league_service.invite(db, user, league, body.username)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return _detail_out(db, _mine(db, user, league_id), user)


@router.post("/{league_id}/join", response_model=LeagueDetailOut)
def join_league(league_id: uuid.UUID, user: CurrentUser, db: DbDep) -> LeagueDetailOut:
    league = _mine(db, user, league_id)
    try:
        league_service.join(db, user, league)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return _detail_out(db, _mine(db, user, league_id), user)


@router.post("/{league_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_invite(league_id: uuid.UUID, user: CurrentUser, db: DbDep) -> None:
    league = _mine(db, user, league_id)
    try:
        league_service.decline(db, user, league)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()


@router.post("/{league_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_league(league_id: uuid.UUID, user: CurrentUser, db: DbDep) -> None:
    league = _mine(db, user, league_id)
    try:
        league_service.leave(db, user, league)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()


@router.delete("/{league_id}/members/{member_id}", response_model=LeagueDetailOut)
def remove_member(
    league_id: uuid.UUID, member_id: uuid.UUID, user: CurrentUser, db: DbDep
) -> LeagueDetailOut:
    league = _mine(db, user, league_id)
    try:
        league_service.remove_member(db, user, league, member_id)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return _detail_out(db, _mine(db, user, league_id), user)


@router.post("/{league_id}/start", response_model=LeagueDetailOut)
def start_league(league_id: uuid.UUID, user: CurrentUser, db: DbDep) -> LeagueDetailOut:
    league = _mine(db, user, league_id)
    try:
        league_service.start(db, user, league)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return _detail_out(db, _mine(db, user, league_id), user)


@router.post("/{league_id}/matches/{match_id}/play", response_model=LeaguePlayOut)
def play_match(
    league_id: uuid.UUID, match_id: uuid.UUID, user: CurrentUser, db: DbDep
) -> LeaguePlayOut:
    """Opens the caller's quiz session for a fixture (or hands back the open one)."""
    league = _mine(db, user, league_id)
    try:
        session = league_service.play(db, user, league, match_id)
    except LeagueError as error:
        raise _fail(error) from error
    db.commit()
    return LeaguePlayOut(session_id=session.id)

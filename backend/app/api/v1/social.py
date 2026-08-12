import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbDep
from app.models import Duel, User, UserStats
from app.models.enums import DuelStatus, FriendshipStatus
from app.schemas.social import (
    DuelCreateRequest,
    DuelListOut,
    DuelOut,
    DuelRecord,
    DuelSide,
    FriendRequestIn,
    FriendRequestOut,
    FriendsOverview,
    PublicUser,
    UserSearchResult,
)
from app.services import duel_service, friendship_service
from app.services.duel_service import DUEL_XP, DuelError
from app.services.friendship_service import FriendshipError

friends_router = APIRouter(prefix="/friends", tags=["friends"])
duels_router = APIRouter(prefix="/duels", tags=["duels"])


def _public(user: User | None) -> PublicUser | None:
    if user is None:
        return None
    stats = user.stats
    return PublicUser(
        id=user.id,
        username=user.username,
        name=user.name,
        level=stats.level if stats else 1,
        duel_wins=stats.duel_wins if stats else 0,
        duel_losses=stats.duel_losses if stats else 0,
        duel_draws=stats.duel_draws if stats else 0,
    )


def _require_public(user: User) -> PublicUser:
    result = _public(user)
    assert result is not None
    return result


# --- Friends ---


@friends_router.get("", response_model=FriendsOverview)
def friends_overview(user: CurrentUser, db: DbDep) -> FriendsOverview:
    return FriendsOverview(
        friends=[_require_public(f) for f in friendship_service.list_friends(db, user)],
        incoming=[
            FriendRequestOut(id=r.id, user=_require_public(r.requester), created_at=r.created_at)
            for r in friendship_service.list_incoming_requests(db, user)
        ],
        sent=[
            FriendRequestOut(id=r.id, user=_require_public(r.addressee), created_at=r.created_at)
            for r in friendship_service.list_sent_requests(db, user)
        ],
    )


@friends_router.get("/search", response_model=list[UserSearchResult])
def search_users(
    user: CurrentUser, db: DbDep, q: str = Query(min_length=2, max_length=20)
) -> list[UserSearchResult]:
    results = []
    for found, friendship in friendship_service.search_users(db, user, q):
        relation = "none"
        if friendship is not None:
            if friendship.status == FriendshipStatus.ACCEPTED:
                relation = "friends"
            elif friendship.status == FriendshipStatus.PENDING:
                relation = (
                    "pending_sent" if friendship.requester_id == user.id else "pending_received"
                )
        results.append(UserSearchResult(user=_require_public(found), relation=relation))  # type: ignore[arg-type]
    return results


@friends_router.post("/requests", status_code=status.HTTP_201_CREATED)
def send_friend_request(body: FriendRequestIn, user: CurrentUser, db: DbDep) -> dict[str, str]:
    try:
        friendship = friendship_service.send_request(db, user, body.username)
    except FriendshipError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    accepted = friendship.status == FriendshipStatus.ACCEPTED
    return {
        "status": friendship.status.value,
        "message": "Vocês agora são amigos!" if accepted else "Pedido enviado",
    }


@friends_router.post("/requests/{request_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept_friend_request(request_id: uuid.UUID, user: CurrentUser, db: DbDep) -> None:
    try:
        friendship_service.respond(db, user, request_id, accept=True)
    except FriendshipError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()


@friends_router.post("/requests/{request_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_friend_request(request_id: uuid.UUID, user: CurrentUser, db: DbDep) -> None:
    try:
        friendship_service.respond(db, user, request_id, accept=False)
    except FriendshipError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()


@friends_router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(friend_id: uuid.UUID, user: CurrentUser, db: DbDep) -> None:
    try:
        friendship_service.remove_friend(db, user, friend_id)
    except FriendshipError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()


# --- Duels ---


def _duel_out(db: DbDep, duel: Duel, user: User) -> DuelOut:
    challenger, opponent = duel_service.side_scores(db, duel)
    i_am_challenger = duel.challenger_id == user.id
    mine, theirs = (challenger, opponent) if i_am_challenger else (opponent, challenger)

    my_result = None
    xp_change = None
    if duel.status == DuelStatus.FINISHED:
        if duel.is_draw:
            my_result, xp_change = "draw", DUEL_XP["draw"]
        elif duel.winner_id == user.id:
            my_result, xp_change = "win", DUEL_XP["win"]
        else:
            my_result, xp_change = "loss", DUEL_XP["loss"]

    def side(score: duel_service.SideScore) -> DuelSide:
        return DuelSide(
            user=_public(score.user),
            correct=score.correct,
            answered=score.answered,
            finished=score.finished,
            time_seconds=score.time_seconds,
        )

    return DuelOut(
        id=duel.id,
        mode=duel.mode,
        status=duel.status,
        created_at=duel.created_at,
        expires_at=duel.expires_at,
        me=side(mine),
        rival=side(theirs),
        my_session_id=duel_service.session_id_for(duel, user),
        my_result=my_result,  # type: ignore[arg-type]
        xp_change=xp_change,
        question_count=duel.challenger_session.question_count,
        # Read from the session: duels created before a rule change keep their own.
        timer_seconds=(duel.challenger_session.filters or {}).get(
            "timer_seconds", duel_service.TIMER_SECONDS
        ),
    )


@duels_router.post("", status_code=status.HTTP_201_CREATED, response_model=DuelOut)
def create_duel(body: DuelCreateRequest, user: CurrentUser, db: DbDep) -> DuelOut:
    try:
        duel = duel_service.create_duel(db, user, opponent_username=body.opponent_username)
    except DuelError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    fresh = duel_service.get_duel(db, duel.id)
    assert fresh is not None
    return _duel_out(db, fresh, user)


@duels_router.get("", response_model=DuelListOut)
def list_duels(
    user: CurrentUser, db: DbDep, limit: int = Query(default=20, ge=1, le=50)
) -> DuelListOut:
    duels = duel_service.list_duels(db, user, limit=limit)
    db.commit()  # lazy resolutions may have finished duels
    items = [_duel_out(db, duel, user) for duel in duels]
    stats = db.get(UserStats, user.id)
    assert stats is not None
    played = stats.duel_wins + stats.duel_losses + stats.duel_draws
    return DuelListOut(
        items=items,
        record=DuelRecord(
            wins=stats.duel_wins,
            losses=stats.duel_losses,
            draws=stats.duel_draws,
            current_streak=stats.current_duel_streak,
            best_streak=stats.best_duel_streak,
            win_rate=(stats.duel_wins / played) if played else None,
        ),
        awaiting_me=sum(
            1
            for item in items
            if item.status in (DuelStatus.OPEN, DuelStatus.ACTIVE) and not item.me.finished
        ),
    )


@duels_router.get("/{duel_id}", response_model=DuelOut)
def get_duel(duel_id: uuid.UUID, user: CurrentUser, db: DbDep) -> DuelOut:
    try:
        duel = duel_service.get_duel_for_user(db, user, duel_id)
    except DuelError as error:
        raise HTTPException(error.status_code, error.message) from error
    db.commit()
    return _duel_out(db, duel, user)

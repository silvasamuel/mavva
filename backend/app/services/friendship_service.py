"""Friend requests and lists.

A friendship is stored once, from the requester's side; both directions are
considered when looking one up, so `a -> b` and `b -> a` are the same relation.
Deactivated accounts never show up in the lists, same as on the leaderboards;
reactivating the account brings the friendship back.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Friendship, User
from app.models.enums import FriendshipStatus

MAX_SEARCH_RESULTS = 20
MAX_FRIENDS = 70


class FriendshipError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


def find_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username.strip().lower()))


def friendship_between(db: Session, a: uuid.UUID, b: uuid.UUID) -> Friendship | None:
    return db.scalar(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == a) & (Friendship.addressee_id == b),
                (Friendship.requester_id == b) & (Friendship.addressee_id == a),
            )
        )
    )


def friend_count(db: Session, user_id: uuid.UUID) -> int:
    """Active friends only — the same people the friends page lists."""
    return (
        db.scalar(
            select(func.count())
            .select_from(Friendship)
            .join(
                User,
                or_(
                    (Friendship.requester_id == user_id) & (User.id == Friendship.addressee_id),
                    (Friendship.addressee_id == user_id) & (User.id == Friendship.requester_id),
                ),
            )
            .where(Friendship.status == FriendshipStatus.ACCEPTED, User.is_active.is_(True))
        )
        or 0
    )


def _ensure_room(db: Session, me: User, other: User) -> None:
    if friend_count(db, me.id) >= MAX_FRIENDS:
        raise FriendshipError(f"Você já tem {MAX_FRIENDS} amigos, o limite")
    if friend_count(db, other.id) >= MAX_FRIENDS:
        raise FriendshipError(f"@{other.username} já tem {MAX_FRIENDS} amigos, o limite")


def search_users(db: Session, me: User, query: str) -> list[tuple[User, Friendship | None]]:
    """Users whose handle starts with `query`, each paired with our relation to them."""
    term = query.strip().lower()
    if len(term) < 2:
        return []
    users = db.scalars(
        select(User)
        .where(User.username.like(f"{term}%"), User.id != me.id, User.is_active.is_(True))
        .options(selectinload(User.stats))
        .order_by(User.username)
        .limit(MAX_SEARCH_RESULTS)
    ).all()
    return [(user, friendship_between(db, me.id, user.id)) for user in users]


def send_request(db: Session, me: User, username: str) -> Friendship:
    target = find_by_username(db, username)
    if target is None or not target.is_active:
        raise FriendshipError("Usuário não encontrado", status_code=404)
    if target.id == me.id:
        raise FriendshipError("Você não pode adicionar a si mesmo")

    existing = friendship_between(db, me.id, target.id)
    if existing is not None:
        if existing.status == FriendshipStatus.ACCEPTED:
            raise FriendshipError("Vocês já são amigos")
        if existing.status == FriendshipStatus.BLOCKED:
            raise FriendshipError("Não é possível enviar o pedido")
        if existing.requester_id == me.id:
            raise FriendshipError("Pedido já enviado")
        # They had already invited us — accept instead of creating a mirror row.
        _ensure_room(db, me, target)
        existing.status = FriendshipStatus.ACCEPTED
        existing.responded_at = datetime.now(UTC)
        db.flush()
        return existing

    _ensure_room(db, me, target)
    friendship = Friendship(requester_id=me.id, addressee_id=target.id)
    db.add(friendship)
    db.flush()
    return friendship


def _load_pending_for_me(db: Session, me: User, friendship_id: uuid.UUID) -> Friendship:
    friendship = db.get(Friendship, friendship_id)
    if friendship is None or friendship.addressee_id != me.id:
        raise FriendshipError("Pedido não encontrado", status_code=404)
    if friendship.status != FriendshipStatus.PENDING:
        raise FriendshipError("Este pedido já foi respondido")
    return friendship


def respond(db: Session, me: User, friendship_id: uuid.UUID, accept: bool) -> Friendship | None:
    friendship = _load_pending_for_me(db, me, friendship_id)
    if not accept:
        db.delete(friendship)
        db.flush()
        return None
    _ensure_room(db, me, friendship.requester)
    friendship.status = FriendshipStatus.ACCEPTED
    friendship.responded_at = datetime.now(UTC)
    db.flush()
    return friendship


def remove_friend(db: Session, me: User, other_id: uuid.UUID) -> None:
    friendship = friendship_between(db, me.id, other_id)
    if friendship is None:
        raise FriendshipError("Amizade não encontrada", status_code=404)
    db.delete(friendship)
    db.flush()


def list_friends(db: Session, me: User) -> list[User]:
    rows = db.scalars(
        select(Friendship)
        .where(
            Friendship.status == FriendshipStatus.ACCEPTED,
            or_(Friendship.requester_id == me.id, Friendship.addressee_id == me.id),
        )
        .options(
            selectinload(Friendship.requester).selectinload(User.stats),
            selectinload(Friendship.addressee).selectinload(User.stats),
        )
    ).all()
    friends = [f.addressee if f.requester_id == me.id else f.requester for f in rows]
    return sorted((friend for friend in friends if friend.is_active), key=lambda u: u.username)


def list_incoming_requests(db: Session, me: User) -> list[Friendship]:
    return list(
        db.scalars(
            select(Friendship)
            .join(User, User.id == Friendship.requester_id)
            .where(
                Friendship.addressee_id == me.id,
                Friendship.status == FriendshipStatus.PENDING,
                User.is_active.is_(True),
            )
            .options(selectinload(Friendship.requester).selectinload(User.stats))
            .order_by(Friendship.created_at.desc())
        ).all()
    )


def list_sent_requests(db: Session, me: User) -> list[Friendship]:
    return list(
        db.scalars(
            select(Friendship)
            .join(User, User.id == Friendship.addressee_id)
            .where(
                Friendship.requester_id == me.id,
                Friendship.status == FriendshipStatus.PENDING,
                User.is_active.is_(True),
            )
            .options(selectinload(Friendship.addressee).selectinload(User.stats))
            .order_by(Friendship.created_at.desc())
        ).all()
    )


def are_friends(db: Session, a: uuid.UUID, b: uuid.UUID) -> bool:
    friendship = friendship_between(db, a, b)
    return friendship is not None and friendship.status == FriendshipStatus.ACCEPTED

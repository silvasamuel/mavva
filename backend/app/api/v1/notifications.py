from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbDep
from app.schemas.notification import NotificationFeedOut, NotificationOut
from app.services import announcement_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationFeedOut)
def notification_feed(user: CurrentUser, db: DbDep) -> NotificationFeedOut:
    rows = announcement_service.feed(db, user)
    return NotificationFeedOut(
        items=[
            NotificationOut(
                id=a.id,
                title=a.title,
                body=a.body,
                kind=a.kind,
                published_at=a.published_at,  # type: ignore[arg-type]  # feed() only returns published
                unread=unread,
            )
            for a, unread in rows
        ],
        unread_count=sum(1 for _, unread in rows if unread),
    )


@router.post("/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_notifications_seen(user: CurrentUser, db: DbDep) -> None:
    """Called when the player opens "Novidades": everything published so far is read."""
    announcement_service.mark_seen(user)
    db.commit()

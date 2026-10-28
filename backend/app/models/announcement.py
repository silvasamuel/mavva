import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import AnnouncementKind


class Announcement(TimestampMixin, Base):
    """An update the team announces to every player (the "Novidades" screen).

    A draft has no published_at; publishing stamps it, and a player has not read
    it while it is newer than their notifications_seen_at (or their signup).
    """

    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[AnnouncementKind] = mapped_column(
        Enum(
            AnnouncementKind,
            name="announcement_kind",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    published_at: Mapped[datetime | None] = mapped_column(default=None, index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

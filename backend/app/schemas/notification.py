import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.enums import AnnouncementKind

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class NotificationOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    kind: AnnouncementKind
    published_at: datetime
    unread: bool


class NotificationFeedOut(BaseModel):
    items: list[NotificationOut]  # newest first
    unread_count: int


class AnnouncementIn(BaseModel):
    title: Title
    body: Body
    kind: AnnouncementKind
    published: bool = False  # false keeps it as a draft


class AnnouncementUpdate(BaseModel):
    title: Title | None = None
    body: Body | None = None
    kind: AnnouncementKind | None = None
    published: bool | None = None


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    body: str
    kind: AnnouncementKind
    published_at: datetime | None  # null = draft
    created_at: datetime
    updated_at: datetime

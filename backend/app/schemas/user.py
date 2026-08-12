import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import UserRole

Name = Annotated[str, StringConstraints(min_length=2, max_length=120, strip_whitespace=True)]
Username = Annotated[
    str,
    StringConstraints(
        min_length=3, max_length=20, pattern=r"^[a-z0-9_]+$", strip_whitespace=True, to_lower=True
    ),
]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    username: str
    email: str
    role: UserRole
    timezone: str
    daily_goal_xp: int


class UserUpdate(BaseModel):
    name: Name | None = None
    username: Username | None = None
    daily_goal_xp: int | None = Field(default=None, ge=10, le=500)
    timezone: str | None = Field(default=None, max_length=64)

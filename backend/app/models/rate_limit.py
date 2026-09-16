from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RateLimitBucket(Base):
    """Fixed-window counter that survives Vercel isolates (unlike in-memory slowapi)."""

    __tablename__ = "rate_limit_buckets"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    window_started_at: Mapped[datetime]
    count: Mapped[int] = mapped_column(default=0)

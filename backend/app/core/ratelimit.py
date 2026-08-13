from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings


def client_ip(request: Request) -> str:
    """Use the original client IP when running behind Render's proxy."""
    if get_settings().is_production:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
            if ip:
                return ip
    return get_remote_address(request)


limiter = Limiter(
    key_func=client_ip,
    enabled=get_settings().rate_limit_enabled,
)

import logging

import httpx

from app.core.config import get_settings
from app.services.email_templates import password_reset_email_html, verification_email_html

logger = logging.getLogger("mavva.email")


def send_password_reset(to_email: str, to_name: str, raw_token: str) -> None:
    settings = get_settings()
    link = f"{settings.public_origin}/reset-password?token={raw_token}"

    if not settings.resend_api_key:
        # Development: the link shows up in the server logs.
        logger.info("Password reset for %s: %s", to_email, link)
        return

    _deliver(
        to_email,
        "Mavva — redefinição de senha",
        password_reset_email_html(to_name, link, settings.reset_token_expire_minutes),
    )


def send_email_verification(to_email: str, to_name: str, raw_token: str) -> None:
    settings = get_settings()
    link = f"{settings.public_origin}/verify-email?token={raw_token}"

    if not settings.resend_api_key:
        logger.info("Email verification for %s: %s", to_email, link)
        return

    _deliver(
        to_email,
        "Mavva — confirme seu e-mail",
        verification_email_html(to_name, link, settings.verification_token_expire_hours),
    )


def _deliver(to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    api_key = settings.resend_api_key
    assert api_key is not None
    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": settings.email_from,
            "to": [to_email],
            "subject": subject,
            "html": body,
        },
        timeout=10,
    )
    response.raise_for_status()

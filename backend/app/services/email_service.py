import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("mavva.email")


def send_password_reset(to_email: str, to_name: str, raw_token: str) -> None:
    settings = get_settings()
    link = f"{settings.frontend_origin}/reset-password?token={raw_token}"

    if not settings.resend_api_key:
        # Development: the link shows up in the server logs.
        logger.info("Password reset for %s: %s", to_email, link)
        return

    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={
            "from": settings.email_from,
            "to": [to_email],
            "subject": "Mavva — redefinição de senha",
            "html": (
                f"<p>Olá, {to_name}!</p>"
                f"<p>Recebemos um pedido para redefinir sua senha no Mavva. "
                f'<a href="{link}">Clique aqui para criar uma nova senha</a>. '
                f"O link expira em {settings.reset_token_expire_minutes} minutos.</p>"
                f"<p>Se não foi você, ignore este e-mail.</p>"
            ),
        },
        timeout=10,
    )
    response.raise_for_status()

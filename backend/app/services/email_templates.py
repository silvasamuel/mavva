"""Branded HTML for transactional e-mails.

Table-based layout with inline styles only — no flexbox/grid, no external
CSS relied on for anything structural — so it survives Outlook desktop,
Gmail's CSS stripping, and every other inbox that mangles modern HTML.
Colors mirror frontend/tailwind.config.js (leaf/grain/sand/ink) so a
confirmation e-mail looks like it came from the same app as the dashboard.
"""

import base64
import html

# Mirrors frontend/public/manna.svg (the seed-sprout mascot shown on Logo.tsx)
# byte for byte. Kept as a literal here — not read off disk — because the
# backend image never ships the frontend's public/ folder (see Dockerfile).
# If the mascot art changes, copy the new SVG source in here too.
_MASCOT_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">'
    '<rect x="30.4" y="4" width="3.2" height="9" rx="1.6" fill="#237d31"/>'
    '<ellipse cx="25.6" cy="7.6" rx="7.2" ry="4.2" transform="rotate(-28 25.6 7.6)" '
    'fill="#8dd295"/>'
    '<ellipse cx="38.6" cy="7.2" rx="6.6" ry="3.8" transform="rotate(32 38.6 7.2)" fill="#bce6c0"/>'
    '<path d="M32 12.5C44.8 20.2 53 33.6 53 44.8 53 54.6 43.8 61.5 32 61.5S11 54.6 11 44.8'
    'C11 33.6 19.2 20.2 32 12.5Z" fill="#57b663"/>'
    '<path d="M32 61.5c9.2 0 16.6-5 18.8-12.4-3.2 5.2-9.4 8.6-18.8 8.6-8.6 0-14.8-3.2-18.2-8.2'
    'C16.2 56.4 23.4 61.5 32 61.5Z" fill="#329a40"/>'
    '<ellipse cx="32" cy="48.5" rx="11" ry="8.2" fill="#8dd295"/>'
    '<circle cx="24.4" cy="36.6" r="8.1" fill="#fefaec"/>'
    '<circle cx="39.6" cy="36.6" r="8.1" fill="#fefaec"/>'
    '<circle cx="25.1" cy="37.3" r="4.35" fill="#2b3229"/>'
    '<circle cx="40.3" cy="37.3" r="4.35" fill="#2b3229"/>'
    '<circle cx="23.2" cy="35.2" r="1.55" fill="#fff"/>'
    '<circle cx="38.4" cy="35.2" r="1.55" fill="#fff"/>'
    "</svg>"
)
MASCOT_DATA_URI = "data:image/svg+xml;base64," + base64.b64encode(
    _MASCOT_SVG.encode("utf-8")
).decode("ascii")

LEAF_700 = "#1e6329"
LEAF_600 = "#237d31"
GRAIN_400 = "#efb62f"
GRAIN_600 = "#cd7211"
GRAIN_900 = "#723315"
SAND_50 = "#faf8f2"
SAND_500 = "#9c8d67"
INK = "#2b3229"

FONT_STACK = (
    "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
)


def _shell(*, preheader: str, heading: str, body_html: str) -> str:
    """Wraps the message-specific body in the header/footer every Mavva
    e-mail shares. `preheader` is the hidden preview text inboxes show next
    to the subject line."""
    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap">
<title>{html.escape(heading)}</title>
</head>
<body style="margin:0; padding:0; background-color:{SAND_50}; font-family:{FONT_STACK};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
    {html.escape(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:{SAND_50};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
               style="max-width:480px; width:100%; background-color:#ffffff; border-radius:24px;
                      overflow:hidden;">
          <tr>
            <td align="center"
                style="background-color:{LEAF_700};
                       background-image:linear-gradient(135deg, {LEAF_700}, {LEAF_600});
                       padding:32px 24px;">
              <img src="{MASCOT_DATA_URI}" width="48" height="48" alt="Mavva"
                   style="display:block; margin:0 auto;">
              <div style="font-family:{FONT_STACK}; font-weight:800; font-size:22px; color:#ffffff;
                          letter-spacing:-0.02em; margin-top:6px;">
                mavva
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px 32px; font-family:{FONT_STACK}; color:{INK};">
              {body_html}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px 32px; border-top:1px solid #f3efe4;">
              <p style="margin:0; font-family:{FONT_STACK}; font-size:12px; font-weight:600;
                        color:{SAND_500}; line-height:1.6;">
                E-mail automático, não é preciso responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _button(label: str, link: str) -> str:
    """Bulletproof-ish button: a padded, block-level anchor. Loses its
    rounded corners on old Outlook desktop but stays a working link
    everywhere — safer than a VML fallback that isn't worth the complexity
    for two transactional e-mails."""
    safe_link = html.escape(link, quote=True)
    return f"""\
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
      <tr>
        <td align="center" style="border-radius:16px; background-color:{GRAIN_400};
                                    border-bottom:3px solid {GRAIN_600};">
          <a href="{safe_link}"
             style="display:inline-block; padding:14px 28px; font-family:{FONT_STACK};
                    font-weight:800; font-size:14px; letter-spacing:0.02em;
                    text-transform:uppercase; color:{GRAIN_900}; text-decoration:none;">
            {html.escape(label)}
          </a>
        </td>
      </tr>
    </table>
"""


def _fallback_link(link: str) -> str:
    # word-break lives on the <a>, not the <p> — otherwise ordinary words in
    # the sentence before it (e.g. "navegador") fracture mid-word too on a
    # narrow phone screen.
    safe_link = html.escape(link, quote=True)
    return f"""\
    <p style="margin:0; font-family:{FONT_STACK}; font-size:12px; color:{SAND_500};
              line-height:1.6;">
      Se o botão não funcionar, copie e cole este link no navegador:<br>
      <a href="{safe_link}" style="color:{LEAF_600}; word-break:break-all;">{safe_link}</a>
    </p>
"""


def verification_email_html(to_name: str, link: str, expire_hours: int) -> str:
    name = html.escape(to_name)
    body = f"""\
    <p style="margin:0 0 4px 0; font-size:18px; font-weight:800;">Olá, {name}! &#128075;</p>
    <p style="margin:0 0 4px 0; font-size:15px; font-weight:600; line-height:1.6;">
      Falta pouco para começar a colher o maná da Palavra todos os dias. Confirme seu e-mail
      para ativar a conta.
    </p>
    {_button("Confirmar e-mail", link)}
    <p style="margin:0 0 20px 0; font-size:13px; font-weight:700; color:{SAND_500};">
      Este link expira em {expire_hours} horas.
    </p>
    {_fallback_link(link)}
    <p style="margin:20px 0 0 0; font-size:12px; font-weight:600; color:{SAND_500};
              line-height:1.6;">
      Se você não criou uma conta no Mavva, é só ignorar este e-mail.
    </p>
"""
    return _shell(
        preheader="Confirme seu e-mail para começar a estudar no Mavva.",
        heading="Confirme seu e-mail — Mavva",
        body_html=body,
    )


def password_reset_email_html(to_name: str, link: str, expire_minutes: int) -> str:
    name = html.escape(to_name)
    body = f"""\
    <p style="margin:0 0 4px 0; font-size:18px; font-weight:800;">Olá, {name}!</p>
    <p style="margin:0 0 4px 0; font-size:15px; font-weight:600; line-height:1.6;">
      Recebemos um pedido para redefinir sua senha no Mavva.
    </p>
    {_button("Criar nova senha", link)}
    <p style="margin:0 0 20px 0; font-size:13px; font-weight:700; color:{SAND_500};">
      Este link expira em {expire_minutes} minutos.
    </p>
    {_fallback_link(link)}
    <p style="margin:20px 0 0 0; font-size:12px; font-weight:600; color:{SAND_500};
              line-height:1.6;">
      Se não foi você quem pediu, é só ignorar este e-mail — sua senha continua a mesma.
    </p>
"""
    return _shell(
        preheader="Redefina sua senha do Mavva.",
        heading="Redefinição de senha — Mavva",
        body_html=body,
    )

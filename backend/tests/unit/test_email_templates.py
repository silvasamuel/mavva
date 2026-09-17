"""Branded transactional e-mails: the user's name is untrusted input, so it
must always come back escaped, and the action link/expiry must survive
intact for every message we send."""

from app.services.email_templates import password_reset_email_html, verification_email_html


class TestVerificationEmail:
    def test_includes_the_link_and_expiry(self):
        html = verification_email_html("Ana", "https://mavva.com.br/verify-email?token=abc123", 48)
        assert "https://mavva.com.br/verify-email?token=abc123" in html
        assert "48 horas" in html
        assert "Ana" in html

    def test_escapes_the_display_name(self):
        html = verification_email_html(
            "<script>alert(1)</script>", "https://mavva.com.br/verify-email?token=x", 48
        )
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html

    def test_link_is_html_attribute_safe(self):
        # A token containing a quote must not break out of the href attribute.
        html = verification_email_html(
            "Maria", 'https://mavva.com.br/verify-email?token=a"onmouseover="x', 48
        )
        assert 'href="https://mavva.com.br/verify-email?token=a"' not in html
        assert "&quot;onmouseover=&quot;" in html


class TestPasswordResetEmail:
    def test_includes_the_link_and_expiry(self):
        html = password_reset_email_html(
            "Samuel", "https://mavva.com.br/reset-password?token=xyz", 30
        )
        assert "https://mavva.com.br/reset-password?token=xyz" in html
        assert "30 minutos" in html
        assert "Samuel" in html

    def test_escapes_the_display_name(self):
        html = password_reset_email_html(
            "<b>hi</b>", "https://mavva.com.br/reset-password?token=x", 30
        )
        assert "<b>hi</b>" not in html
        assert "&lt;b&gt;" in html

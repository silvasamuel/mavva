"""announce "Apoie o Mavva" on the Novidades screen

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-11-06 16:00:00.000000

Ships with the feature and is published the moment the deploy migrates.
A regular row from then on: the admin can edit or unpublish it.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | None = "e9f0a1b2c3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANNOUNCEMENT_ID = "9a2d4f6b-1c3e-4a5b-8d7f-0e1a2b3c4d5e"

TITLE = "Apoie o Mavva e vire Mavva Apoiador"

BODY = """O Mavva é gratuito e sem anúncios, e queremos que continue assim. Agora dá para ajudar a manter o projeto no ar com uma oferta via Pix, direto na tela inicial.

Para que serve a sua oferta:
• Pagar o servidor e o banco de dados que mantêm o Mavva funcionando.
• Trazer novas perguntas, novas funcionalidades e melhorias no jogo.
• Desenvolver os aplicativos nativos para Android e iOS.

O que você ganha ao ofertar:
• O selo de Mavva Apoiador ao lado do seu elo, visível para todos os jogadores.
• A skin dourada de Apoiador no painel do jogo e na barra de XP.
• Em breve: criar ligas só para convidados, adicionar suas próprias perguntas à liga e missões diárias.

Cada R$ 30 ofertados mantêm o selo por 30 dias, somando ao prazo que você já tiver. A oferta mínima é de R$ 5, e o pagamento é processado pelo Mercado Pago."""


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO announcements (id, title, body, kind, published_at) "
            "VALUES (CAST(:id AS uuid), :title, :body, 'feature', now())"
        ).bindparams(id=ANNOUNCEMENT_ID, title=TITLE, body=BODY)
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM announcements WHERE id = CAST(:id AS uuid)").bindparams(
            id=ANNOUNCEMENT_ID
        )
    )

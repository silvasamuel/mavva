"""announce the seals (wisdom, contributor, months of support) on Novidades

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-11 12:00:00.000000

Ships with the feature and is published the moment the deploy migrates, so
every player sees it once in the Home modal. A regular row from then on: the
admin can edit or unpublish it.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANNOUNCEMENT_ID = "38fa1fc6-0df6-48dd-9bfb-f82abada0c83"

TITLE = "Selos novos: Sabedoria, Contribuidor e meses de apoio"

BODY = """Agora o seu elo anda acompanhado: até três selos aparecem ao lado dele no ranking, nos duelos, na lista de amigos e no seu card de jogador.

• Sabedoria (de 1 a 10): sobe quando você acerta perguntas médias (1 ponto), difíceis (3) e especialistas (5), e cai quando você erra (de 1 a 3 pontos). Vale a sua última resposta a cada pergunta: errar uma que você já sabia custa os pontos dela, e acertar de novo recupera. Não zera na virada da temporada.
• Contribuidor (bronze, prata, ouro e diamante): para quem ajuda a melhorar o Mavva. Conta cada erro reportado que foi corrigido, cada pergunta sugerida que entrou no jogo e cada melhoria aceita pela equipe. Bronze com 1, prata com 5, ouro com 15 e diamante com 40.
• Apoiador com meses: o selo dourado agora mostra há quantos meses você apoia o Mavva. Os meses não precisam ser seguidos: quem volta continua de onde parou.

Onde acompanhar:
• No Perfil, o cartão Selos mostra quanto falta para o próximo nível de sabedoria e para o próximo selo de contribuidor.
• Toque em qualquer jogador no ranking para ver os selos dele.
• Para contribuir, use Sugerir ou o botão de reportar pergunta durante o quiz."""


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

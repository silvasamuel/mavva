"""announce the season trophies on the Novidades screen

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-10-28 14:00:00.000000

Ships the announcement with the features it describes, published the moment
the deploy migrates. It's a regular row from then on: the admin can edit or
unpublish it.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: str | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANNOUNCEMENT_ID = "6f1c2a9e-5b7d-4e3a-9c1f-2d8b7a4e6c10"

TITLE = "Troféus da temporada e recordes de todos os tempos"

BODY = """Agora terminar a temporada no pódio vale troféu!

• Troféus de ouro, prata e bronze: o 1º, o 2º e o 3º lugar levam o troféu do mês para o perfil. Cada mês tem o nome de uma das 12 tribos de Israel, e o card da temporada mostra qual está em jogo, com uma curiosidade sobre a tribo.
• Comemoração: quem ficar no pódio ganha uma comemoração especial no primeiro acesso depois da virada do mês.
• Conquistas de temporada: seis novas conquistas para quem termina no top 10, no pódio ou vence a temporada.
• Recordes de todos os tempos: no Ranking, as 3 maiores pontuações já feitas numa temporada.
• Perfil dos jogadores em abas: troféus, conquistas e estatísticas, cada um no seu lugar."""


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

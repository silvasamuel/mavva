"""announce the leagues on the Novidades screen

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-13 11:00:00.000000

Ships with the feature and is published the moment the deploy migrates, so
every player sees it once in the Home modal. A regular row from then on: the
admin can edit or unpublish it.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANNOUNCEMENT_ID = "aff22c1c-495f-4e64-b47d-3d843bc8a5ff"

TITLE = "Ligas: crie a sua competição e convide a turma"

BODY = """Chegaram as Ligas: competições fechadas, só para quem você convidar. Estão no menu, em Ligas.

Como funciona:
• Você dá um nome, escolhe a data de encerramento, os temas (pelo menos 7) e as dificuldades das perguntas.
• Convida até 20 jogadores pelo nome de usuário, pela lista de amigos ou por um link para mandar no WhatsApp, e começa quando todos estiverem dentro.
• Você escolhe quantas perguntas tem cada partida (de 5 a 20) e o tempo por pergunta. Em cada partida, todos respondem às mesmas perguntas.

Dois formatos:
• Pontos: você define quantas rodadas. Todos jogam todas, e quem somar mais pontos até a data final é o campeão.
• Copa: mata-mata em duelos, com o chaveamento sorteado no início e visível para todos. Precisa de 2, 4, 8 ou 16 jogadores para fechar as chaves, e quem cai na semifinal ainda disputa o 3º lugar. Cada duelo tem 24 horas: quem não jogar no prazo perde por W.O. e a chave segue.

Cada liga tem o seu próprio menu e o seu próprio ranking, e as ligas de que você participou ficam guardadas no histórico. Há também seis conquistas novas para quem joga e vence ligas.

As Ligas são um benefício dos Mavva Apoiadores: para criar uma liga, aceitar um convite e jogar é preciso estar com o selo ativo. Quem ainda não apoia pode acompanhar tudo pela tela de Ligas."""


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

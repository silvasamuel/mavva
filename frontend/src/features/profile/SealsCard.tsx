import { Link } from 'react-router-dom'
import type { DashboardData, User } from '@/types/api'
import { Card, CardTitle } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ContributorSeal, SupporterSeal, WisdomSeal } from '@/components/PlayerSeals'
import { formatDate } from '@/lib/format'
import { TIER_LABEL, WISDOM_MAX } from '@/lib/seals'

type Stats = DashboardData['stats']

function Row({
  seal,
  title,
  children,
}: {
  seal: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      {seal}
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-extrabold leading-tight text-ink">{title}</p>
        {children}
      </div>
    </li>
  )
}

const HINT = 'text-xs font-semibold text-sand-500'
const LINK = 'text-xs font-extrabold text-leaf-700 underline-offset-2 hover:underline'

/**
 * The player's own seals, with what others never see: how far the next
 * wisdom level and contributor tier are, and until when the supporter seal
 * lasts. Seals not earned yet show as empty slots with the way to get them.
 */
export function SealsCard({
  wisdom,
  contributor,
  user,
}: {
  wisdom: NonNullable<Stats['wisdom']>
  contributor: NonNullable<Stats['contributor']>
  user: User | null
}) {
  const wisdomSpan = wisdom.next_level_at != null ? wisdom.next_level_at - wisdom.level_floor : 1
  const wisdomLeft = wisdom.next_level_at != null ? wisdom.next_level_at - wisdom.points : 0
  const tierLeft =
    contributor.next_tier_at != null ? contributor.next_tier_at - contributor.contributions : 0

  return (
    <Card className="space-y-4">
      <CardTitle>Selos</CardTitle>
      <ul className="space-y-5">
        <Row
          seal={<WisdomSeal level={wisdom.level} size="lg" />}
          title={`Sabedoria · nível ${wisdom.level} de ${WISDOM_MAX}`}
        >
          {wisdom.next_level_at != null ? (
            <>
              <ProgressBar
                value={wisdom.points - wisdom.level_floor}
                max={wisdomSpan}
                className="h-2"
                color="bg-leaf-500"
              />
              <p className={HINT}>
                {wisdomLeft === 1 ? 'Falta 1 ponto' : `Faltam ${wisdomLeft} pontos`} para o nível{' '}
                {wisdom.level + 1}.
              </p>
            </>
          ) : (
            <p className={HINT}>Nível máximo: {wisdom.points} pontos de sabedoria.</p>
          )}
          <p className={HINT}>
            Cada pergunta acertada pela primeira vez conta: média 1 ponto, difícil 3, especialista
            5. Não recomeça com a temporada.
          </p>
        </Row>

        <Row
          seal={<ContributorSeal tier={contributor.tier} size="lg" />}
          title={
            contributor.tier
              ? `Contribuidor ${TIER_LABEL[contributor.tier]}`
              : 'Contribuidor · ainda sem selo'
          }
        >
          {contributor.next_tier && contributor.next_tier_at != null ? (
            <>
              <ProgressBar
                value={contributor.contributions}
                max={contributor.next_tier_at}
                className="h-2"
                color="bg-grain-400"
              />
              <p className={HINT}>
                {contributor.contributions}{' '}
                {contributor.contributions === 1 ? 'contribuição aceita' : 'contribuições aceitas'}{' '}
                · {tierLeft === 1 ? 'falta 1' : `faltam ${tierLeft}`} para{' '}
                {TIER_LABEL[contributor.next_tier]}.
              </p>
            </>
          ) : (
            <p className={HINT}>
              {contributor.contributions} contribuições aceitas. Você chegou ao selo máximo.
            </p>
          )}
          <p className={HINT}>
            Contam os erros que você reporta e as perguntas e melhorias que sugere, quando a equipe
            aceita.{' '}
            <Link to="/suggest" className={LINK}>
              Sugerir agora
            </Link>
          </p>
        </Row>

        <Row
          seal={<SupporterSeal active={user?.is_supporter ?? false} size="lg" />}
          title={user?.is_supporter ? 'Mavva Apoiador' : 'Apoiador · selo inativo'}
        >
          <p className={HINT}>
            {user?.is_supporter
              ? `Selo ativo até ${formatDate(user.supporter_until)}.`
              : user?.supporter_until
                ? `Seu selo valeu até ${formatDate(user.supporter_until)}.`
                : 'Quem apoia o Mavva via Pix ganha o selo e o painel dourado.'}{' '}
            <Link to="/apoie" className={LINK}>
              {user?.is_supporter ? 'Estender' : 'Apoiar o Mavva'}
            </Link>
          </p>
        </Row>
      </ul>
    </Card>
  )
}

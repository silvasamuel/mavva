import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DashboardData } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { RankBadge } from '@/components/RankBadge'
import { nextRankCopy } from '@/lib/ranks'
import { AppIcons, Glyph, type Icon } from '@/lib/icons'

type Notice = 'start' | 'end'

function Rule({ icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Glyph as={icon} className="mt-0.5 h-5 w-5 shrink-0 text-grain-600" />
      <span className="text-sm font-semibold text-sand-700">{children}</span>
    </li>
  )
}

const MEDAL = [
  'bg-grain-400 text-grain-900',
  'bg-sand-200 text-sand-700',
  'bg-[#E3A56E] text-[#5C3412]',
]

/** How last season ended: its top three, the champion with the trophy. */
function LastPodium({ podium }: { podium: NonNullable<DashboardData['last_season_podium']> }) {
  return (
    <section
      aria-label={`Pódio de ${podium.season.name}`}
      className="rounded-2xl bg-grain-50 p-3 ring-1 ring-grain-200"
    >
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-grain-700">
        Pódio de {podium.season.name}
      </p>
      <ol className="space-y-1.5 text-left">
        {podium.entries.map((entry) => (
          <li key={entry.position} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${MEDAL[entry.position - 1]}`}
            >
              {entry.position === 1 ? (
                <Glyph as={AppIcons.ranking} className="h-4 w-4" />
              ) : (
                `${entry.position}º`
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">
              @{entry.username}
            </span>
            <span className="text-xs font-extrabold tabular-nums text-sand-500">
              {entry.final_xp.toLocaleString('pt-BR')} XP
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StartBody({ data }: { data: DashboardData }) {
  const { season, stats } = data
  const last = stats.last_season_rank
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <RankBadge code={last?.code ?? 'semente'} size="lg" />
        <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">
          Nova temporada
        </p>
        <h2 className="text-xl font-extrabold leading-tight text-ink">
          Começou a temporada de {season.name}!
        </h2>
        <p className="text-sm font-semibold text-sand-500">
          {last
            ? `Você terminou o mês passado como ${last.name}. Seu maior elo é ${stats.best_rank.name}.`
            : 'No Mavva, cada mês é uma temporada. Veja como funciona:'}
        </p>
      </div>
      {data.last_season_podium && <LastPodium podium={data.last_season_podium} />}
      <ul className="space-y-2.5 rounded-2xl bg-sand-50 p-4 text-left">
        <Rule icon={AppIcons.season}>
          Todo dia 1º,{' '}
          <strong className="font-extrabold text-ink">XP, nível e o ranking de XP</strong> recomeçam
          para todos.
        </Rule>
        <Rule icon={AppIcons.crown}>
          Seu <strong className="font-extrabold text-ink">maior elo</strong> e o do{' '}
          <strong className="font-extrabold text-ink">mês passado</strong> ficam guardados no
          perfil.
        </Rule>
        <Rule icon={AppIcons.ranking}>
          O <strong className="font-extrabold text-ink">1º lugar</strong> leva o troféu de campeão,
          e o pódio é revelado no fim de cada temporada.
        </Rule>
        <Rule icon={AppIcons.check}>
          Conquistas, sequência, duelos e precisão continuam valendo.
        </Rule>
      </ul>
    </>
  )
}

function EndBody({ data }: { data: DashboardData }) {
  const { season, stats } = data
  const toNext =
    stats.rank.next_level != null ? Math.max(0, stats.rank.next_level - stats.level) : 0
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <span className="relative inline-flex">
          <RankBadge code={stats.rank.code} size="lg" />
          <Glyph
            as={AppIcons.hourglass}
            className="absolute -right-3 -top-1 h-7 w-7 text-grain-500"
          />
        </span>
        <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">Reta final</p>
        <h2 className="text-xl font-extrabold leading-tight text-ink">
          {season.days_left <= 1
            ? `A temporada de ${season.name} termina hoje`
            : `A temporada de ${season.name} termina em ${season.days_left} dias`}
        </h2>
        <p className="text-sm font-semibold text-sand-500">
          Hoje você está em <strong className="font-extrabold text-ink">{stats.rank.name}</strong> ·
          nível {stats.level}. {nextRankCopy(toNext, stats.rank.next_name)}.
        </p>
      </div>
      <ul className="space-y-2.5 rounded-2xl bg-grain-50 p-4 text-left ring-1 ring-grain-200">
        <Rule icon={AppIcons.season}>
          No dia 1º, XP e nível recomeçam e{' '}
          <strong className="font-extrabold text-ink">{stats.rank.name}</strong> vira o seu elo do
          mês passado.
        </Rule>
        <Rule icon={AppIcons.ranking}>
          Quem terminar em <strong className="font-extrabold text-ink">1º lugar</strong> leva o
          troféu de campeão para o perfil, e o pódio é revelado para todos.
        </Rule>
        <Rule icon={AppIcons.levelUp}>Cada quiz até lá conta: suba de elo antes da virada.</Rule>
      </ul>
    </>
  )
}

/**
 * The season's welcome (first visit of a new season) and its last-week warning.
 * The server decides which one is due and remembers the dismissal, so each
 * shows once per season on any device.
 */
export function SeasonNoticeModal({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Keep the content while the modal animates closed.
  const [shown, setShown] = useState<Notice | null>(data.season_notice)
  const [open, setOpen] = useState(data.season_notice != null)
  if (data.season_notice != null && data.season_notice !== shown && !open) {
    setShown(data.season_notice)
    setOpen(true)
  }

  function dismiss(then?: () => void) {
    if (!shown) return
    setOpen(false)
    queryClient.setQueryData<DashboardData>(['dashboard'], (current) =>
      current ? { ...current, season_notice: null } : current
    )
    // Fire and forget: if it fails, the notice just shows again next visit.
    void api.post('/users/me/season-notice', { notice: shown }).catch(() => {})
    then?.()
  }

  return (
    <Modal
      open={open}
      onClose={() => dismiss()}
      label={shown === 'end' ? 'Fim da temporada' : 'Nova temporada'}
    >
      {shown === 'end' ? <EndBody data={data} /> : <StartBody data={data} />}
      {shown === 'end' ? (
        <div className="flex flex-col gap-2">
          <Button variant="gold" full onClick={() => dismiss(() => navigate('/quiz/new'))}>
            Jogar agora
          </Button>
          <Button variant="secondary" full onClick={() => dismiss()}>
            Depois
          </Button>
        </div>
      ) : (
        <Button full onClick={() => dismiss()}>
          Bora começar
        </Button>
      )}
    </Modal>
  )
}

import { useNavigate } from 'react-router-dom'
import type { DashboardData, RankRef } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { RankBadge } from '@/components/RankBadge'
import { daysBetween } from '@/lib/format'
import { AppIcons, Glyph } from '@/lib/icons'
import { daysLeftLabel, isFinalWeek } from './season'

function EloCell({ label, rank }: { label: string; rank: RankRef | null }) {
  return (
    // <dt> must come before <dd>; `order` puts the rank name above the label.
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-2xl bg-white/80 px-1.5 py-2.5 text-center">
      {rank ? (
        <RankBadge code={rank.code} size="sm" />
      ) : (
        <span className="h-8 w-8 rounded-full bg-sand-100" />
      )}
      <dt className="order-3 max-w-full truncate text-xs font-bold text-sand-500">{label}</dt>
      <dd className="order-2 max-w-full truncate text-sm font-extrabold text-ink">
        {rank?.name ?? 'Sem elo'}
      </dd>
    </div>
  )
}

/**
 * Always on the home screen: which season it is, how long is left, and the
 * three elos that matter (now, best ever, last month). Turns gold in the final
 * week so the deadline is hard to miss.
 */
export function SeasonCard({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const { season, stats } = data
  const finalWeek = isFinalWeek(season)
  const length = daysBetween(season.starts_on, season.ends_on)
  const elapsed = Math.max(0, length - season.days_left)

  return (
    <section
      aria-label="Temporada"
      className={`rounded-3xl p-5 shadow-card ${
        finalWeek
          ? 'bg-gradient-to-br from-grain-100 via-grain-50 to-white ring-2 ring-grain-300'
          : 'bg-white/75 backdrop-blur-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            finalWeek ? 'bg-grain-400 text-grain-900' : 'bg-grain-100 text-grain-700'
          }`}
        >
          <Glyph as={finalWeek ? AppIcons.hourglass : AppIcons.season} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">
            {finalWeek ? 'Reta final da temporada' : `Temporada ${season.number}`}
          </p>
          <h2 className="text-lg font-extrabold leading-tight text-ink">
            Temporada de {season.name}
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
            finalWeek ? 'bg-grain-400 text-grain-900' : 'bg-sand-100 text-sand-600'
          }`}
        >
          {daysLeftLabel(season.days_left)}
        </span>
      </div>

      <ProgressBar
        value={elapsed}
        max={length}
        color={finalWeek ? 'bg-grain-500' : 'bg-grain-400'}
        className="mt-4 h-2.5"
      />

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <EloCell label="Elo atual" rank={stats.rank} />
        <EloCell label="Maior elo" rank={stats.best_rank} />
        <EloCell label="Mês passado" rank={stats.last_season_rank} />
      </dl>

      <p className="mt-3 text-sm font-semibold text-sand-600">
        {finalWeek
          ? `Últimos dias: no dia 1º o pódio é revelado, o pódio leva troféus de ouro, prata e bronze, e ${stats.rank.name} fica guardado como o seu elo do mês passado.`
          : 'Todo dia 1º, XP, nível e o ranking de XP recomeçam. O pódio leva troféus de ouro, prata e bronze, e seus elos ficam guardados no perfil.'}
      </p>

      <Button
        variant={finalWeek ? 'gold' : 'secondary'}
        size="sm"
        className="mt-3 w-full sm:w-auto"
        onClick={() => navigate(finalWeek ? '/quiz/new' : '/ranking')}
      >
        {finalWeek ? 'Subir de elo agora' : 'Ver ranking da temporada'}
      </Button>
    </section>
  )
}

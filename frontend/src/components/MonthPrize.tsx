import { MonthTrophy } from '@/components/MonthTrophy'
import { trophyForSeason } from '@/lib/trophies'

/**
 * What this season's podium plays for: the month's trophy (named for its tribe)
 * in silver, gold and bronze, laid out like the podium. `season` is the
 * season's name ("outubro de 2026").
 */
export function MonthPrize({ season, compact = false }: { season: string; compact?: boolean }) {
  const { month, tribe } = trophyForSeason(season)
  const side = compact ? 'h-9 w-8' : 'h-12 w-10'
  return (
    <section
      aria-label={`Troféu de ${month}: tribo de ${tribe}`}
      className="flex items-center gap-3 rounded-2xl bg-grain-50 p-3 text-left ring-1 ring-grain-200"
    >
      <div aria-hidden className="flex shrink-0 items-end">
        <MonthTrophy season={season} place={2} className={`${side} -mr-2`} />
        <MonthTrophy
          season={season}
          place={1}
          className={`relative z-10 ${compact ? 'h-12 w-10' : 'h-16 w-14'}`}
        />
        <MonthTrophy season={season} place={3} className={`${side} -ml-2`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">
          Troféu de {month}
        </p>
        <p className={`font-extrabold leading-tight text-ink ${compact ? 'text-sm' : 'text-base'}`}>
          Tribo de {tribe}
        </p>
        <p className="text-xs font-semibold text-sand-500">
          Ouro, prata e bronze para o pódio da temporada.
        </p>
      </div>
    </section>
  )
}

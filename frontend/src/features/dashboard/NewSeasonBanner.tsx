import { useState } from 'react'
import type { DashboardData } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { RankBadge } from '@/components/RankBadge'

/** How long into a season the welcome stays up, unless dismissed earlier. */
const SHOW_FOR_DAYS = 7

function storageKey(seasonNumber: number): string {
  return `mavva:new-season-seen:${seasonNumber}`
}

function wasDismissed(seasonNumber: number): boolean {
  try {
    return window.localStorage.getItem(storageKey(seasonNumber)) === '1'
  } catch {
    return false
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * Explains why XP and level went back to the start: shown in the first days of
 * a season to players who played the previous one.
 */
export function NewSeasonBanner({ data }: { data: DashboardData }) {
  const { season, stats } = data
  const [dismissed, setDismissed] = useState(() => wasDismissed(season.number))
  const last = stats.last_season_rank
  const daysIn = daysBetween(season.starts_on, season.ends_on) - season.days_left

  if (!last || dismissed || daysIn >= SHOW_FOR_DAYS) return null

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(storageKey(season.number), '1')
    } catch {
      // Private mode: it just shows again next time.
    }
  }

  return (
    <section
      aria-label="Nova temporada"
      className="flex flex-col gap-3 rounded-[1.75rem] bg-grain-50 p-5 ring-1 ring-grain-200 sm:flex-row sm:items-center"
    >
      <RankBadge code={last.code} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">
          Nova temporada · {season.name}
        </p>
        <p className="mt-0.5 font-extrabold text-ink">
          Você terminou a última temporada como {last.name}.
        </p>
        <p className="text-sm font-semibold text-sand-500">
          XP, nível e ranking recomeçaram para todos. Seu maior elo, {stats.best_rank.name}, fica
          no perfil.
        </p>
      </div>
      <Button variant="secondary" onClick={dismiss}>
        Entendi
      </Button>
    </section>
  )
}

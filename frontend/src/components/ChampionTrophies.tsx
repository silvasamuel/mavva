import { MonthTrophy } from '@/components/MonthTrophy'
import { trophyForSeason } from '@/lib/trophies'

/**
 * A shelf with one trophy per season the player won, most recent first. Each
 * month has its own trophy, set with that month's stone (see lib/trophies).
 */
export function ChampionTrophies({ titles }: { titles: string[] }) {
  return (
    <ul aria-label="Troféus de campeão" className="flex flex-wrap justify-center gap-3">
      {titles.map((season) => {
        const { stone } = trophyForSeason(season)
        return (
          <li
            key={season}
            aria-label={`Campeão · ${season} (${stone})`}
            className="flex w-24 flex-col items-center gap-0.5 rounded-2xl bg-grain-50 px-1 pb-2 pt-2 ring-1 ring-grain-200"
          >
            <MonthTrophy season={season} />
            <span className="text-center text-[11px] font-extrabold leading-tight text-grain-800">
              {season}
            </span>
            <span className="text-[10px] font-semibold text-sand-500">{stone}</span>
          </li>
        )
      })}
    </ul>
  )
}

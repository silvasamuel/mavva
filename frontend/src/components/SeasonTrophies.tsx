import { MonthTrophy } from '@/components/MonthTrophy'
import { trophyForSeason } from '@/lib/trophies'

const PLACE = { 1: '1º lugar', 2: '2º lugar', 3: '3º lugar' } as Record<number, string>

/**
 * The trophy shelf: one cup per podium finish, most recent first. Gold, silver
 * or bronze by place, set with the stone of the season's month (lib/trophies).
 */
export function SeasonTrophies({ trophies }: { trophies: { season: string; position: number }[] }) {
  return (
    <ul aria-label="Troféus de temporada" className="flex flex-wrap justify-center gap-3">
      {trophies.map(({ season, position }) => {
        const { stone } = trophyForSeason(season)
        return (
          <li
            key={season}
            aria-label={`${PLACE[position]} · ${season} (${stone})`}
            className={`flex w-24 flex-col items-center gap-0.5 rounded-2xl px-1 pb-2 pt-2 ring-1 ${
              position === 1 ? 'bg-grain-50 ring-grain-300' : 'bg-sand-50 ring-sand-200'
            }`}
          >
            <MonthTrophy season={season} place={position} />
            <span className="text-[11px] font-extrabold text-ink">{PLACE[position]}</span>
            <span className="text-center text-[11px] font-semibold leading-tight text-sand-600">
              {season}
            </span>
            <span className="text-[10px] font-semibold text-sand-400">{stone}</span>
          </li>
        )
      })}
    </ul>
  )
}

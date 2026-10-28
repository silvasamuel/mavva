import { AppIcons, Glyph } from '@/lib/icons'

/** One gold trophy per season the player won, most recent first. */
export function ChampionTrophies({ titles }: { titles: string[] }) {
  return (
    <ul aria-label="Troféus de campeão" className="flex flex-wrap justify-center gap-2">
      {titles.map((season) => (
        <li
          key={season}
          className="flex items-center gap-1.5 rounded-full bg-grain-50 py-1 pl-1.5 pr-3 ring-1 ring-grain-300"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-grain-400 text-grain-900">
            <Glyph as={AppIcons.ranking} className="h-4 w-4" />
          </span>
          <span className="text-xs font-extrabold text-grain-800">Campeão · {season}</span>
        </li>
      ))}
    </ul>
  )
}

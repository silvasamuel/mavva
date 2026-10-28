import type { AllTimePodium as AllTimePodiumData, PublicUser } from '@/types/api'
import { RankBadge } from '@/components/RankBadge'
import { AppIcons, Glyph } from '@/lib/icons'

type Entry = AllTimePodiumData['podium'][number]

// Gold, silver and bronze steps; the winner's is the tallest.
// `order` lays them out 2-1-3 while the list still reads 1, 2, 3.
const STEP: Record<number, { block: string; height: string; label: string; order: string }> = {
  1: { block: 'bg-grain-400 text-grain-900 ring-grain-500', height: 'h-24', label: '1º', order: 'order-2' },
  2: { block: 'bg-sand-200 text-sand-700 ring-sand-300', height: 'h-16', label: '2º', order: 'order-1' },
  3: {
    block: 'bg-[#E3A56E] text-[#5C3412] ring-[#C9844A]',
    height: 'h-12',
    label: '3º',
    order: 'order-3',
  },
}

function Step({ entry, onOpen }: { entry: Entry; onOpen: (user: PublicUser) => void }) {
  const step = STEP[entry.position]
  const first = entry.position === 1
  return (
    <li className={`flex min-w-0 flex-1 flex-col items-center ${step.order}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(entry.user)}
        className="flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-1 pb-2 pt-1 transition-colors hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500"
      >
        {first && <Glyph as={AppIcons.crown} className="h-6 w-6 text-grain-500" />}
        <RankBadge code={entry.user.rank.code} size={first ? 'lg' : 'md'} />
        <span className="w-full truncate text-center text-sm font-extrabold text-ink">
          {entry.is_me ? 'Você' : `@${entry.user.username}`}
        </span>
        <span className="text-xs font-extrabold tabular-nums text-leaf-700">
          {entry.score.toLocaleString('pt-BR')} XP
        </span>
        <span className="w-full truncate text-center text-[11px] font-semibold text-sand-400">
          {entry.season.name}
          {entry.live && ' · ao vivo'}
        </span>
      </button>
      <div
        className={`flex w-full items-start justify-center rounded-t-2xl pt-2 text-lg font-extrabold ring-1 ring-inset ${step.block} ${step.height}`}
        aria-hidden
      >
        {step.label}
      </div>
    </li>
  )
}

/**
 * The three best single-season scores ever (one per player), as a podium:
 * second on the left, the record in the middle, third on the right.
 */
export function AllTimePodium({
  data,
  onOpen,
}: {
  data: AllTimePodiumData
  onOpen: (user: PublicUser) => void
}) {
  if (data.podium.length === 0) return null
  return (
    <section
      aria-label="Pódio de todos os tempos"
      className="rounded-3xl bg-white/80 px-4 pt-4 shadow-card backdrop-blur-sm sm:px-6"
    >
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-sand-600">
        Recordes de todos os tempos
      </h2>
      <p className="text-xs font-semibold text-sand-400">As maiores pontuações em uma temporada.</p>
      <ol className="mt-3 flex items-end gap-2">
        {data.podium.map((entry) => (
          <Step key={entry.user.id} entry={entry} onOpen={onOpen} />
        ))}
      </ol>
    </section>
  )
}

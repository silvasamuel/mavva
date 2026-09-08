import { RankBadge } from '@/components/RankBadge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { AppIcons, Glyph } from '@/lib/icons'

export function GameHud({
  rankCode,
  rankName,
  level,
  xpInto,
  xpForNext,
  streak,
  loading,
}: {
  rankCode?: string
  rankName?: string
  level?: number
  xpInto?: number
  xpForNext?: number
  streak?: number
  loading?: boolean
}) {
  const days = streak ?? 0
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2 shadow-card backdrop-blur-md">
      <RankBadge code={rankCode ?? 'semente'} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-extrabold leading-none">
            {loading ? '…' : rankName ?? 'Semente'}
          </p>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sand-500">
            Nv {loading ? '–' : level ?? 1}
          </p>
        </div>
        <ProgressBar
          value={xpInto ?? 0}
          max={xpForNext ?? 1}
          className="mt-1.5 h-2"
          color="bg-grain-400"
        />
      </div>
      <div
        className={`flex min-w-12 flex-col items-center rounded-xl px-2 py-1 ${
          days > 0 ? 'bg-grain-50' : 'bg-sand-100'
        }`}
      >
        <span className={`text-grain-700 ${days > 0 ? 'animate-streak-pulse' : 'text-sand-400'}`}>
          <Glyph as={days > 0 ? AppIcons.streak : AppIcons.streakOff} className="h-5 w-5" />
        </span>
        <p className="text-sm font-extrabold leading-none text-grain-800">{days}</p>
      </div>
    </div>
  )
}

import { RankBadge } from '@/components/RankBadge'
import { SupporterBadge } from '@/components/SupporterBadge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { AppIcons, Glyph } from '@/lib/icons'
import { nextRankCopy, rankFromLevel, rankProgress } from '@/lib/ranks'

export function GameHud({
  rankCode,
  rankName,
  level,
  xpInto,
  xpForNext,
  streak,
  loading,
  supporter = false,
  onOpenProfile,
}: {
  rankCode?: string
  rankName?: string
  level?: number
  xpInto?: number
  xpForNext?: number
  streak?: number
  loading?: boolean
  /** Mavva Apoiador: gold trim on the panel and the XP bar, plus the badge. */
  supporter?: boolean
  /** Makes the badge a button that opens the player's own profile card. */
  onOpenProfile?: () => void
}) {
  const days = streak ?? 0
  const band = rankFromLevel(level ?? 1)
  const next = band.maxLevel != null ? rankFromLevel(band.maxLevel + 1) : null
  const elo = rankProgress(level ?? 1, band.minLevel, next?.minLevel ?? null)
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-2 shadow-card backdrop-blur-md ${
        supporter
          ? 'bg-gradient-to-r from-grain-50 via-white/90 to-white/80 ring-2 ring-grain-300'
          : 'bg-white/80'
      }`}
    >
      {onOpenProfile ? (
        <button
          type="button"
          aria-label="Ver meu perfil"
          aria-haspopup="dialog"
          onClick={onOpenProfile}
          className="shrink-0 rounded-xl transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500"
        >
          <RankBadge code={rankCode ?? 'semente'} size="sm" />
        </button>
      ) : (
        <RankBadge code={rankCode ?? 'semente'} size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-extrabold leading-none">
            {loading ? '…' : (rankName ?? 'Semente')}
          </p>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sand-500">
            Nv {loading ? '–' : (level ?? 1)}
          </p>
          {supporter && <SupporterBadge />}
        </div>
        <ProgressBar
          value={xpInto ?? 0}
          max={xpForNext ?? 1}
          className={`mt-1.5 h-2 ${supporter ? 'ring-1 ring-grain-200' : ''}`}
          color={
            supporter
              ? 'bg-gradient-to-r from-grain-300 via-grain-400 to-grain-500 shadow-[0_0_8px_0_#f3cb57]'
              : 'bg-grain-400'
          }
        />
        <p className="mt-1 truncate text-xs font-extrabold text-sand-500">
          {nextRankCopy(elo.remaining, next?.name ?? null)}
        </p>
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

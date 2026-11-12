import { RankBadge } from '@/components/RankBadge'
import { PlayerSeals, SupporterFrame } from '@/components/PlayerSeals'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { AppIcons, Glyph } from '@/lib/icons'
import { nextRankCopy, rankFromLevel, rankProgress } from '@/lib/ranks'
import type { ContributorTier } from '@/types/api'

export function GameHud({
  rankCode,
  rankName,
  level,
  xpInto,
  xpForNext,
  streak,
  loading,
  supporter = false,
  wisdomLevel,
  contributorTier,
  onOpenProfile,
}: {
  rankCode?: string
  rankName?: string
  level?: number
  xpInto?: number
  xpForNext?: number
  streak?: number
  loading?: boolean
  /** Mavva Apoiador: gold trim on the panel and the XP bar, plus the seal. */
  supporter?: boolean
  /** Lifetime wisdom (1 to 10); the seal shows once it is known. */
  wisdomLevel?: number
  contributorTier?: ContributorTier | null
  /** Makes the badge a button that opens the player's own profile card. */
  onOpenProfile?: () => void
}) {
  const days = streak ?? 0
  const band = rankFromLevel(level ?? 1)
  const next = band.maxLevel != null ? rankFromLevel(band.maxLevel + 1) : null
  const elo = rankProgress(level ?? 1, band.minLevel, next?.minLevel ?? null)
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-2 backdrop-blur-md ${
        supporter
          ? 'bg-gradient-to-r from-grain-100 via-[#fffaf0] to-white/90 shadow-[0_4px_0_0_#cd7211,0_0_18px_-6px_#f3cb57] ring-2 ring-grain-400'
          : 'bg-white/80 shadow-card'
      }`}
    >
      {supporter && (
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="animate-soft-glow absolute -right-6 -top-10 h-28 w-28 rounded-full bg-grain-300/50 blur-2xl" />
          <span className="absolute -bottom-8 left-16 h-16 w-16 rounded-full bg-grain-200/40 blur-xl" />
        </span>
      )}
      {onOpenProfile ? (
        <button
          type="button"
          aria-label="Ver meu perfil"
          aria-haspopup="dialog"
          onClick={onOpenProfile}
          className="shrink-0 rounded-xl transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500"
        >
          {supporter ? (
            <SupporterFrame>
              <RankBadge code={rankCode ?? 'semente'} size="sm" />
            </SupporterFrame>
          ) : (
            <RankBadge code={rankCode ?? 'semente'} size="sm" />
          )}
        </button>
      ) : supporter ? (
        <SupporterFrame>
          <RankBadge code={rankCode ?? 'semente'} size="sm" />
        </SupporterFrame>
      ) : (
        <RankBadge code={rankCode ?? 'semente'} size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm font-extrabold leading-none ${supporter ? 'text-grain-900' : ''}`}
          >
            {loading ? '…' : (rankName ?? 'Semente')}
          </p>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sand-500">
            Nv {loading ? '–' : (level ?? 1)}
          </p>
          {(wisdomLevel != null || contributorTier || supporter) && (
            <PlayerSeals
              of={{
                wisdom_level: wisdomLevel,
                contributor_tier: contributorTier,
                is_supporter: supporter,
              }}
            />
          )}
        </div>
        <ProgressBar
          value={xpInto ?? 0}
          max={xpForNext ?? 1}
          className={`mt-1.5 h-2 ${supporter ? 'bg-grain-100 ring-1 ring-grain-300' : ''}`}
          color={
            supporter
              ? 'bg-[linear-gradient(110deg,#e89617_0%,#efb62f_35%,#fbf1ca_50%,#efb62f_65%,#e89617_100%)] bg-[length:200%_100%] shadow-[0_0_10px_-1px_#f3cb57] motion-safe:animate-gold-shimmer'
              : 'bg-grain-400'
          }
        />
        <p className="mt-1 truncate text-xs font-extrabold text-sand-500">
          {nextRankCopy(elo.remaining, next?.name ?? null)}
        </p>
      </div>
      <div
        className={`relative flex min-w-12 flex-col items-center rounded-xl px-2 py-1 ${
          supporter
            ? 'bg-gradient-to-b from-grain-100 to-grain-200 ring-1 ring-grain-300'
            : days > 0
              ? 'bg-grain-50'
              : 'bg-sand-100'
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

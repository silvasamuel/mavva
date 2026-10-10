import type { RankRef } from '@/types/api'
import { RankBadge } from '@/components/RankBadge'

/**
 * One elo inside a <dl>. Level resets every season, so the best elo ever and
 * last season's carry the player's standing across them. Fixed height: the
 * profile modal's skeleton reserves the same space.
 */
export function EloTile({ label, rank }: { label: string; rank: RankRef | null }) {
  return (
    <div className="flex h-[3.25rem] items-center gap-2 rounded-2xl bg-sand-50 px-3 text-left">
      {rank ? (
        <RankBadge code={rank.code} size="sm" />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-full bg-sand-100" />
      )}
      {/* <dt> must come before <dd>; `order` puts the rank name on top. */}
      <div className="flex min-w-0 flex-col">
        <dt className="order-2 truncate text-xs font-extrabold uppercase tracking-wide text-sand-500">
          {label}
        </dt>
        <dd className="order-1 truncate text-sm font-extrabold text-ink">
          {rank?.name ?? 'Não jogou'}
        </dd>
      </div>
    </div>
  )
}

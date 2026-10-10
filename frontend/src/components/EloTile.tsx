import type { RankRef } from '@/types/api'
import { RankBadge } from '@/components/RankBadge'

/**
 * One elo inside a <dl>. Level resets every season, so the best elo ever and
 * last season's carry the player's standing across them. No rank (didn't play
 * last month, or there was no last month yet) reads "Sem elo". Fixed height: the
 * profile modal's skeleton reserves the same space.
 */
export function EloTile({ label, rank }: { label: string; rank: RankRef | null }) {
  return (
    // Stacked and centered: side by side, a 360px phone left the label ~70px
    // next to the badge, and even "Maior elo" got cut.
    <div className="flex h-[5.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-sand-50 px-2 text-center">
      {rank ? (
        <RankBadge code={rank.code} size="sm" />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-full bg-sand-100" />
      )}
      {/* <dt> must come before <dd>; `order` puts the rank name above the label. */}
      <dt className="order-3 max-w-full truncate text-xs font-extrabold uppercase tracking-wide text-sand-500">
        {label}
      </dt>
      <dd className="order-2 max-w-full truncate text-sm font-extrabold text-ink">
        {rank?.name ?? 'Sem elo'}
      </dd>
    </div>
  )
}

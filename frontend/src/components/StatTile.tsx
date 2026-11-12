import type { ReactNode } from 'react'
import { Glyph, type Icon } from '@/lib/icons'

/** One number with its label, for a `<dl>` grid of stats. */
export function StatTile({
  icon,
  value,
  label,
  hint,
}: {
  icon: Icon
  value: ReactNode
  label: string
  hint?: string
}) {
  return (
    // <dt> must come before <dd> inside a <dl> group; `order` puts the value on top.
    <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-sand-50 px-2 py-3 text-center">
      <span className="order-1">
        <Glyph as={icon} className="h-5 w-5 text-grain-600" />
      </span>
      <dt className="order-3 text-xs font-extrabold uppercase tracking-wide text-sand-500">
        {label}
      </dt>
      <dd className="order-2 text-lg font-extrabold leading-tight text-ink">{value}</dd>
      {hint && <dd className="order-4 text-xs font-semibold text-sand-400">{hint}</dd>}
    </div>
  )
}

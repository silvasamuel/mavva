import { AppIcons, Glyph } from '@/lib/icons'

const SIZE = {
  sm: 'gap-1 px-1.5 py-0.5 text-[10px]',
  md: 'gap-1.5 px-2.5 py-1 text-xs',
} as const

/** Gold bezel around a rank avatar: part of the supporter skin. */
export function SupporterFrame({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex rounded-2xl bg-gradient-to-br from-grain-200 via-grain-400 to-grain-600 p-[3px] shadow-[0_0_12px_-2px_#f3cb57] ${className}`}
    >
      <span className="inline-flex rounded-[0.8rem] bg-grain-50 p-0.5">{children}</span>
    </span>
  )
}

/** Gold "Apoiador" pill shown next to the rank of players who donated. */
export function SupporterBadge({ size = 'sm' }: { size?: keyof typeof SIZE }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-grain-300 to-grain-400 font-extrabold uppercase tracking-wide text-grain-900 shadow-[0_1px_0_0_#aa5012] ${SIZE[size]}`}
      title="Mavva Apoiador"
    >
      <Glyph as={AppIcons.heart} className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      Apoiador
    </span>
  )
}

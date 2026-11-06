import { AppIcons, Glyph } from '@/lib/icons'

const SIZE = {
  sm: 'gap-1 px-1.5 py-0.5 text-[10px]',
  md: 'gap-1.5 px-2.5 py-1 text-xs',
} as const

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

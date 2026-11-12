import { useId } from 'react'
import type { ContributorTier, PlayerSealsInfo } from '@/types/api'
import { AppIcons, Glyph } from '@/lib/icons'
import { TIER_LABEL, WISDOM_MAX } from '@/lib/seals'

/**
 * The three seals a player can wear next to their rank, each with its own
 * silhouette so they read at a glance even at 20px:
 *   wisdom      — a ring of ten notches around the level (1 to 10)
 *   contributor — a hexagon in bronze, silver, gold or diamond
 *   supporter   — a gold tile with a heart
 */

const BOX = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
} as const

export type SealSize = keyof typeof BOX

const GLYPH = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
} as const

/** Colour grows warmer with the level: seedling greens, then amber, then gold. */
function wisdomTone(level: number) {
  if (level >= WISDOM_MAX) return { ring: '#e89617', soft: '#efb62f', ink: '#723315', top: true }
  if (level >= 7) return { ring: '#efb62f', soft: '#fefaec', ink: '#8a3e15', top: false }
  if (level >= 4) return { ring: '#237d31', soft: '#f1faf1', ink: '#184220', top: false }
  return { ring: '#57b663', soft: '#ffffff', ink: '#1e6329', top: false }
}

/** Solid centre for the small sizes, dark enough for a white number. */
function wisdomDisc(level: number) {
  if (level >= 7) return '#aa5012'
  if (level >= 4) return '#1e6329'
  return '#329a40'
}

/**
 * Wisdom, 1 to 10. Large sizes draw ten notches, one lit per level; in a list
 * row (xs, sm) ten notches would blur, so the seal becomes a solid disc with
 * a bigger number and one arc for how far along the ten levels the player is.
 */
export function WisdomSeal({ level, size = 'xs' }: { level: number; size?: SealSize }) {
  const id = useId().replace(/:/g, '')
  const clamped = Math.min(WISDOM_MAX, Math.max(1, Math.round(level)))
  const tone = wisdomTone(clamped)
  const compact = size === 'xs' || size === 'sm'
  const radius = 16.5
  const circumference = 2 * Math.PI * radius
  const gap = 2.2
  const notch = circumference / WISDOM_MAX - gap
  const label = `Sabedoria ${clamped} de ${WISDOM_MAX}`
  const gold = `url(#wisdom-${id})`
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 ${BOX[size]} ${tone.top ? 'drop-shadow-[0_0_4px_#f3cb57]' : ''}`}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id={`wisdom-${id}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#fbf1ca" />
            <stop offset="0.55" stopColor="#f3cb57" />
            <stop offset="1" stopColor="#e89617" />
          </radialGradient>
        </defs>
        {compact ? (
          <>
            <circle cx="20" cy="20" r={radius} fill="none" stroke="#e5dfcd" strokeWidth="4.6" />
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke={tone.ring}
              strokeWidth="4.6"
              strokeLinecap={clamped < WISDOM_MAX ? 'round' : 'butt'}
              strokeDasharray={`${(circumference * clamped) / WISDOM_MAX} ${circumference}`}
              transform="rotate(-90 20 20)"
            />
            <circle cx="20" cy="20" r="12.6" fill={tone.top ? gold : wisdomDisc(clamped)} />
          </>
        ) : (
          <>
            <circle cx="20" cy="20" r="12.5" fill={tone.top ? gold : tone.soft} />
            {Array.from({ length: WISDOM_MAX }, (_, index) => (
              <circle
                key={index}
                cx="20"
                cy="20"
                r={radius}
                fill="none"
                stroke={index < clamped ? tone.ring : '#e5dfcd'}
                strokeWidth="4.2"
                strokeDasharray={`${notch} ${circumference - notch}`}
                transform={`rotate(${-90 + index * 36 + (gap / circumference) * 180} 20 20)`}
              />
            ))}
          </>
        )}
        <text
          x="20"
          y="20.8"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={compact ? (clamped >= WISDOM_MAX ? 15 : 19) : clamped >= WISDOM_MAX ? 13 : 16}
          fontWeight="800"
          fill={compact && !tone.top ? '#ffffff' : tone.ink}
        >
          {clamped}
        </text>
      </svg>
    </span>
  )
}

const TIER_METAL: Record<
  ContributorTier,
  { light: string; mid: string; deep: string; line: string; icon: string }
> = {
  bronze: { light: '#f3cfa6', mid: '#cd8b4f', deep: '#93562a', line: '#7a4520', icon: '#5c3214' },
  silver: { light: '#f7f9fb', mid: '#cdd3db', deep: '#8e99a6', line: '#74808e', icon: '#4b5563' },
  gold: { light: '#fbf1ca', mid: '#efb62f', deep: '#cd7211', line: '#aa5012', icon: '#723315' },
  diamond: { light: '#f0fdff', mid: '#8fe0f5', deep: '#2f9ec7', line: '#1f7ea3', icon: '#0f4c66' },
}

const HEXAGON = 'M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5Z'

/** `tier` null draws the empty slot: the seal the player hasn't earned yet. */
export function ContributorSeal({
  tier,
  size = 'xs',
}: {
  tier: ContributorTier | null
  size?: SealSize
}) {
  const id = useId().replace(/:/g, '')
  const metal = tier ? TIER_METAL[tier] : null
  const label = tier ? `Contribuidor ${TIER_LABEL[tier]}` : 'Contribuidor: ainda sem selo'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex shrink-0 items-center justify-center ${BOX[size]}`}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden>
        {metal ? (
          <>
            <defs>
              <linearGradient id={`tier-${id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={metal.light} />
                <stop offset="0.5" stopColor={metal.mid} />
                <stop offset="1" stopColor={metal.deep} />
              </linearGradient>
            </defs>
            <path
              d={HEXAGON}
              fill={`url(#tier-${id})`}
              stroke={metal.line}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* Facets: a lit top edge, and on diamond the cut of the stone. */}
            <path d="M20 5.5 32.6 12.7 20 20 7.4 12.7Z" fill="#ffffff" opacity="0.28" />
            {tier === 'diamond' && (
              <path
                d="M7.4 12.7 20 20v14.5M32.6 12.7 20 20"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1"
                opacity="0.7"
              />
            )}
          </>
        ) : (
          <path
            d={HEXAGON}
            fill="#faf8f2"
            stroke="#d1c8ad"
            strokeWidth="1.6"
            strokeDasharray="3 2.4"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ color: metal ? metal.icon : '#b3a684' }}
      >
        <Glyph as={AppIcons.suggest} weight="fill" className={GLYPH[size]} />
      </span>
    </span>
  )
}

/** `active` false draws the empty slot, for the player's own profile. */
export function SupporterSeal({
  active = true,
  size = 'xs',
}: {
  active?: boolean
  size?: SealSize
}) {
  const label = active ? 'Mavva Apoiador' : 'Apoiador: selo inativo'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] ${BOX[size]} ${
        active
          ? 'bg-gradient-to-br from-grain-200 via-grain-400 to-grain-600 text-white shadow-[inset_0_0_0_1px_#aa5012,0_0_6px_-1px_#f3cb57]'
          : 'border border-dashed border-sand-300 bg-sand-50 text-sand-400'
      }`}
    >
      <Glyph as={AppIcons.heart} weight="fill" className={GLYPH[size]} />
    </span>
  )
}

/**
 * The seals a player has, side by side: wisdom always (everyone starts at 1),
 * contributor and supporter only once earned.
 */
export function PlayerSeals({
  of,
  size = 'xs',
  className = '',
}: {
  of: PlayerSealsInfo
  size?: SealSize
  className?: string
}) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <WisdomSeal level={of.wisdom_level ?? 1} size={size} />
      {of.contributor_tier && <ContributorSeal tier={of.contributor_tier} size={size} />}
      {of.is_supporter && <SupporterSeal size={size} />}
    </span>
  )
}

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

function SealTile({
  seal,
  label,
  value,
  detail,
}: {
  seal: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-sand-25 px-2 py-3 text-center ring-1 ring-sand-100">
      {seal}
      <dt className="mt-1 text-[11px] font-extrabold uppercase tracking-wide text-sand-500">
        {label}
      </dt>
      <dd className="text-sm font-extrabold leading-tight text-ink">{value}</dd>
      <dd className="text-xs font-semibold leading-tight text-sand-500">{detail}</dd>
    </div>
  )
}

/**
 * The seals spelled out, for a profile card: one tile each, with what the
 * seal means in words. Unearned contributor/supporter seals are left out, so
 * a card never points at what someone else doesn't have.
 */
export function SealShelf({ of, contributions }: { of: PlayerSealsInfo; contributions?: number }) {
  const level = of.wisdom_level ?? 1
  return (
    <dl aria-label="Selos" className="flex gap-2">
      <SealTile
        seal={<WisdomSeal level={level} size="lg" />}
        label="Sabedoria"
        value={`Nível ${level}`}
        detail={`de ${WISDOM_MAX}`}
      />
      {of.contributor_tier && (
        <SealTile
          seal={<ContributorSeal tier={of.contributor_tier} size="lg" />}
          label="Contribuidor"
          value={TIER_LABEL[of.contributor_tier]}
          detail={
            contributions == null
              ? 'Ajuda a melhorar o Mavva'
              : `${contributions} ${contributions === 1 ? 'aceita' : 'aceitas'}`
          }
        />
      )}
      {of.is_supporter && (
        <SealTile
          seal={<SupporterSeal size="lg" />}
          label="Apoiador"
          value="Ativo"
          detail="Mantém o Mavva no ar"
        />
      )}
    </dl>
  )
}

import { useId } from 'react'
import { trophyForSeason } from '@/lib/trophies'

// Cup metal by podium place: light, mid and deep tone, a darker tone for the
// handles and stem, the outline, and the engraving on the base.
const METALS = {
  1: {
    light: '#FFE9A0',
    mid: '#F3C641',
    deep: '#C98A12',
    dark: ['#E0A92A', '#9C6408'],
    line: '#8A5A06',
    engraving: '#F3C641',
    shine: '#FFF3C4',
  },
  2: {
    light: '#F7F9FB',
    mid: '#CDD3DB',
    deep: '#8F98A5',
    dark: ['#B3BAC4', '#6B7480'],
    line: '#545C67',
    engraving: '#DDE2E8',
    shine: '#FFFFFF',
  },
  3: {
    light: '#F7CFA8',
    mid: '#D58F55',
    deep: '#97561F',
    dark: ['#BE7A3F', '#7A4419'],
    line: '#663510',
    engraving: '#E8A56B',
    shine: '#FBE0C6',
  },
} as const

/**
 * A cup set with the month's stone, the month engraved on the base: gold for
 * the champion, silver for 2nd, bronze for 3rd. `season` is the season's name
 * ("setembro de 2026").
 */
export function MonthTrophy({
  season,
  place = 1,
  className = 'h-16 w-14',
}: {
  season: string
  place?: number
  className?: string
}) {
  const trophy = trophyForSeason(season)
  const metal = METALS[(place === 2 || place === 3 ? place : 1) as 1 | 2 | 3]
  const id = useId().replace(/:/g, '')
  const gold = `gold-${id}`
  const goldDark = `gold-dark-${id}`
  const gem = `gem-${id}`
  return (
    <svg viewBox="0 0 64 76" className={className} aria-hidden>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={metal.light} />
          <stop offset="0.45" stopColor={metal.mid} />
          <stop offset="1" stopColor={metal.deep} />
        </linearGradient>
        <linearGradient id={goldDark} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={metal.dark[0]} />
          <stop offset="1" stopColor={metal.dark[1]} />
        </linearGradient>
        <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={trophy.gem[0]} />
          <stop offset="1" stopColor={trophy.gem[1]} />
        </linearGradient>
      </defs>
      {/* handles */}
      <path
        d="M14 12 C2 12 2 30 17 33 M50 12 C62 12 62 30 47 33"
        fill="none"
        stroke={`url(#${goldDark})`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* cup */}
      <path
        d="M12 8 H52 C52 28 46 38 32 40 C18 38 12 28 12 8 Z"
        fill={`url(#${gold})`}
        stroke={metal.line}
        strokeWidth="1.5"
      />
      <path d="M12 8 H52" stroke={metal.shine} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M18 13 C18 24 21 31 26 35"
        fill="none"
        stroke="#FFF6D6"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* the month's stone */}
      <polygon
        points="32,14 40,21 32,30 24,21"
        fill={`url(#${gem})`}
        stroke={metal.line}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon points="32,14 36,21 32,21 28,21" fill="#FFFFFF" opacity="0.45" />
      {/* stem and base */}
      <path
        d="M28 40 H36 L35 50 H29 Z"
        fill={`url(#${goldDark})`}
        stroke={metal.line}
        strokeWidth="1.2"
      />
      <rect
        x="20"
        y="50"
        width="24"
        height="6"
        rx="2"
        fill={`url(#${gold})`}
        stroke={metal.line}
        strokeWidth="1.2"
      />
      <rect
        x="14"
        y="56"
        width="36"
        height="16"
        rx="3"
        fill="#5B3A1C"
        stroke="#3A230E"
        strokeWidth="1.2"
      />
      <text
        x="32"
        y="68"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill={metal.engraving}
        fontFamily="Nunito, system-ui, sans-serif"
        letterSpacing="1"
      >
        {trophy.short}
      </text>
    </svg>
  )
}

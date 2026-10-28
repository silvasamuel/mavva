import { useId } from 'react'
import { trophyForSeason } from '@/lib/trophies'

/**
 * A gold cup set with the month's stone, the month engraved on the base.
 * `season` is the season's name ("setembro de 2026").
 */
export function MonthTrophy({ season, className = 'h-16 w-14' }: { season: string; className?: string }) {
  const trophy = trophyForSeason(season)
  const id = useId().replace(/:/g, '')
  const gold = `gold-${id}`
  const goldDark = `gold-dark-${id}`
  const gem = `gem-${id}`
  return (
    <svg viewBox="0 0 64 76" className={className} aria-hidden>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFE9A0" />
          <stop offset="0.45" stopColor="#F3C641" />
          <stop offset="1" stopColor="#C98A12" />
        </linearGradient>
        <linearGradient id={goldDark} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E0A92A" />
          <stop offset="1" stopColor="#9C6408" />
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
        stroke="#8A5A06"
        strokeWidth="1.5"
      />
      <path d="M12 8 H52" stroke="#FFF3C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 13 C18 24 21 31 26 35" fill="none" stroke="#FFF6D6" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      {/* the month's stone */}
      <polygon
        points="32,14 40,21 32,30 24,21"
        fill={`url(#${gem})`}
        stroke="#7A4E05"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon points="32,14 36,21 32,21 28,21" fill="#FFFFFF" opacity="0.45" />
      {/* stem and base */}
      <path d="M28 40 H36 L35 50 H29 Z" fill={`url(#${goldDark})`} stroke="#8A5A06" strokeWidth="1.2" />
      <rect x="20" y="50" width="24" height="6" rx="2" fill={`url(#${gold})`} stroke="#8A5A06" strokeWidth="1.2" />
      <rect x="14" y="56" width="36" height="16" rx="3" fill="#5B3A1C" stroke="#3A230E" strokeWidth="1.2" />
      <text
        x="32"
        y="68"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill="#F3C641"
        fontFamily="Nunito, system-ui, sans-serif"
        letterSpacing="1"
      >
        {trophy.short}
      </text>
    </svg>
  )
}

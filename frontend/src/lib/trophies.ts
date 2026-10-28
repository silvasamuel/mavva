/**
 * One trophy per month of the year, each named for one of the twelve tribes of
 * Israel in the order of Jacob's sons' birth: January is Rúben, December is
 * Benjamim. The gem is that tribe's stone on the high priest's breastplate,
 * which carried their names "according to their birth" (Êxodo 28:10, 17-21).
 */
export interface MonthTrophyStyle {
  /** "setembro" */
  month: string
  /** "SET" — engraved on the base */
  short: string
  /** "Issacar" */
  tribe: string
  /** the tribe's breastplate stone, as a gradient: light facet, deep facet */
  gem: [string, string]
}

export const MONTH_TROPHIES: MonthTrophyStyle[] = [
  { month: 'janeiro', short: 'JAN', tribe: 'Rúben', gem: ['#FF9A5C', '#C2410C'] },
  { month: 'fevereiro', short: 'FEV', tribe: 'Simeão', gem: ['#FFE27A', '#D99A06'] },
  { month: 'março', short: 'MAR', tribe: 'Levi', gem: ['#FF6B7A', '#A3122A'] },
  { month: 'abril', short: 'ABR', tribe: 'Judá', gem: ['#6EE7A0', '#0B8A4A'] },
  { month: 'maio', short: 'MAI', tribe: 'Dã', gem: ['#7DB8FF', '#1D3FA8'] },
  { month: 'junho', short: 'JUN', tribe: 'Naftali', gem: ['#FFFFFF', '#A9D8F2'] },
  { month: 'julho', short: 'JUL', tribe: 'Gade', gem: ['#FFB27A', '#C4521E'] },
  { month: 'agosto', short: 'AGO', tribe: 'Aser', gem: ['#E6D2C0', '#8A6248'] },
  { month: 'setembro', short: 'SET', tribe: 'Issacar', gem: ['#CDB8FF', '#6D35D9'] },
  { month: 'outubro', short: 'OUT', tribe: 'Zebulom', gem: ['#9CF2E8', '#1E9C99'] },
  { month: 'novembro', short: 'NOV', tribe: 'José', gem: ['#9CA3AF', '#1F2227'] },
  { month: 'dezembro', short: 'DEZ', tribe: 'Benjamim', gem: ['#F29AC2', '#9B2D63'] },
]

/** The trophy for a season named like "setembro de 2026" (January if unknown). */
export function trophyForSeason(seasonName: string): MonthTrophyStyle {
  const month = seasonName.split(' ')[0]?.toLowerCase()
  return MONTH_TROPHIES.find((trophy) => trophy.month === month) ?? MONTH_TROPHIES[0]
}

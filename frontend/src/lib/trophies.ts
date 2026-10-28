/**
 * One champion trophy per month of the year, each set with one of the twelve
 * stones of the high priest's breastplate (Êxodo 28:17-20), in the order the
 * text lists them: January gets the first stone, December the last.
 */
export interface MonthTrophyStyle {
  /** "setembro" */
  month: string
  /** "SET" — engraved on the base */
  short: string
  /** "Ametista" */
  stone: string
  /** gem gradient: light facet, deep facet */
  gem: [string, string]
}

export const MONTH_TROPHIES: MonthTrophyStyle[] = [
  { month: 'janeiro', short: 'JAN', stone: 'Sárdio', gem: ['#FF9A5C', '#C2410C'] },
  { month: 'fevereiro', short: 'FEV', stone: 'Topázio', gem: ['#FFE27A', '#D99A06'] },
  { month: 'março', short: 'MAR', stone: 'Carbúnculo', gem: ['#FF6B7A', '#A3122A'] },
  { month: 'abril', short: 'ABR', stone: 'Esmeralda', gem: ['#6EE7A0', '#0B8A4A'] },
  { month: 'maio', short: 'MAI', stone: 'Safira', gem: ['#7DB8FF', '#1D3FA8'] },
  { month: 'junho', short: 'JUN', stone: 'Diamante', gem: ['#FFFFFF', '#A9D8F2'] },
  { month: 'julho', short: 'JUL', stone: 'Jacinto', gem: ['#FFB27A', '#C4521E'] },
  { month: 'agosto', short: 'AGO', stone: 'Ágata', gem: ['#E6D2C0', '#8A6248'] },
  { month: 'setembro', short: 'SET', stone: 'Ametista', gem: ['#CDB8FF', '#6D35D9'] },
  { month: 'outubro', short: 'OUT', stone: 'Berilo', gem: ['#9CF2E8', '#1E9C99'] },
  { month: 'novembro', short: 'NOV', stone: 'Ônix', gem: ['#9CA3AF', '#1F2227'] },
  { month: 'dezembro', short: 'DEZ', stone: 'Jaspe', gem: ['#F29AC2', '#9B2D63'] },
]

/** The trophy for a season named like "setembro de 2026" (January if unknown). */
export function trophyForSeason(seasonName: string): MonthTrophyStyle {
  const month = seasonName.split(' ')[0]?.toLowerCase()
  return MONTH_TROPHIES.find((trophy) => trophy.month === month) ?? MONTH_TROPHIES[0]
}

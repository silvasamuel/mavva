import type { ContributorTier } from '@/types/api'

/** Wisdom runs from 1 to this level. */
export const WISDOM_MAX = 10

export const TIER_LABEL: Record<ContributorTier, string> = {
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
  diamond: 'Diamante',
}

/** "1 mês de apoio", "3 meses de apoio": the number on the supporter seal, in words. */
export function supporterMonthsLabel(months: number): string {
  return months === 1 ? '1 mês de apoio' : `${months} meses de apoio`
}

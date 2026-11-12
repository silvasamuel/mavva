import type { ContributorTier } from '@/types/api'

/** Wisdom runs from 1 to this level. */
export const WISDOM_MAX = 10

export const TIER_LABEL: Record<ContributorTier, string> = {
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
  diamond: 'Diamante',
}

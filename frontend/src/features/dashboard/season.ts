import type { Season } from '@/types/api'

/** The season's last week: the end-of-season notice and the card's "reta final". */
export const FINAL_WEEK_DAYS = 7

export function isFinalWeek(season: Season): boolean {
  return season.days_left <= FINAL_WEEK_DAYS
}

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 1) return 'Último dia'
  return `${daysLeft} dias restantes`
}

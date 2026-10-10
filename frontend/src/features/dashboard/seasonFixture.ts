import type { DashboardData } from '@/types/api'

/** Just the dashboard fields the season pieces read. */
export function seasonDashboard({
  daysLeft = 20,
  notice = null as DashboardData['season_notice'],
  last = { code: 'oliveira', name: 'Oliveira' } as DashboardData['stats']['last_season_rank'],
} = {}): DashboardData {
  return {
    season: {
      number: 2,
      name: 'novembro de 2026',
      starts_on: '2026-11-01',
      ends_on: '2026-12-01',
      days_left: daysLeft,
    },
    season_notice: notice,
    stats: {
      level: 12,
      rank: {
        code: 'espiga',
        name: 'Espiga',
        min_level: 11,
        max_level: 15,
        next_code: 'videira',
        next_name: 'Videira',
        next_level: 16,
      },
      best_rank: { code: 'cedro', name: 'Cedro' },
      last_season_rank: last,
    },
  } as DashboardData
}

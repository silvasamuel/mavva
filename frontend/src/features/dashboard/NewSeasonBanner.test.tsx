import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DashboardData } from '@/types/api'
import { NewSeasonBanner } from './NewSeasonBanner'

function dashboard({
  daysLeft = 30,
  last = { code: 'oliveira', name: 'Oliveira' } as DashboardData['stats']['last_season_rank'],
} = {}): DashboardData {
  return {
    season: {
      number: 3,
      name: 'novembro de 2026',
      starts_on: '2026-11-01',
      ends_on: '2026-12-01',
      days_left: daysLeft,
    },
    stats: {
      best_rank: { code: 'cedro', name: 'Cedro' },
      last_season_rank: last,
    },
  } as DashboardData
}

describe('NewSeasonBanner', () => {
  beforeEach(() => window.localStorage.clear())

  it('welcomes the player to the new season with last season’s elo', () => {
    render(<NewSeasonBanner data={dashboard()} />)
    const banner = screen.getByRole('region', { name: 'Nova temporada' })
    expect(banner).toHaveTextContent('Nova temporada · novembro de 2026')
    expect(banner).toHaveTextContent('Você terminou a última temporada como Oliveira.')
    expect(banner).toHaveTextContent('Seu maior elo, Cedro, fica no perfil.')
  })

  it('stays hidden once dismissed, for that season', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<NewSeasonBanner data={dashboard()} />)
    await user.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(screen.queryByRole('region', { name: 'Nova temporada' })).not.toBeInTheDocument()

    unmount()
    render(<NewSeasonBanner data={dashboard()} />)
    expect(screen.queryByRole('region', { name: 'Nova temporada' })).not.toBeInTheDocument()
  })

  it('is gone after the first week and for who didn’t play last season', () => {
    const { unmount } = render(<NewSeasonBanner data={dashboard({ daysLeft: 23 })} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    unmount()
    render(<NewSeasonBanner data={dashboard({ last: null })} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})

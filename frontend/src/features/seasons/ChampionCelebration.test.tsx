import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData } from '@/types/api'
import { ChampionCelebration } from './ChampionCelebration'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}))

function renderWith(celebration: DashboardData['champion_celebration']) {
  const client = new QueryClient()
  client.setQueryData(['dashboard'], { champion_celebration: celebration } as DashboardData)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ChampionCelebration />} />
          <Route path="/profile" element={<p>perfil</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return client
}

describe('ChampionCelebration', () => {
  beforeEach(() => {
    get.mockReset().mockReturnValue(new Promise(() => {}))
    post.mockReset().mockResolvedValue(undefined)
  })

  it('stays away from everyone but the champion', () => {
    renderWith(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('celebrates the champion and remembers it was seen', async () => {
    const user = userEvent.setup()
    const client = renderWith({ season: { number: 2, name: 'setembro de 2026' }, final_xp: 4200 })

    const dialog = screen.getByRole('dialog', { name: 'Campeão da temporada de setembro de 2026' })
    expect(dialog).toHaveTextContent('Você terminou em 1º lugar com 4.200 XP')

    await user.click(screen.getByRole('button', { name: 'Ver meu troféu' }))

    expect(post).toHaveBeenCalledWith('/users/me/champion-celebration')
    expect(client.getQueryData<DashboardData>(['dashboard'])?.champion_celebration).toBeNull()
    expect(await screen.findByText('perfil')).toBeInTheDocument()
  })
})

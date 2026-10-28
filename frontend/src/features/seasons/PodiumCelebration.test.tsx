import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData } from '@/types/api'
import { PodiumCelebration } from './PodiumCelebration'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}))

function renderWith(celebration: DashboardData['podium_celebration']) {
  const client = new QueryClient()
  client.setQueryData(['dashboard'], { podium_celebration: celebration } as DashboardData)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<PodiumCelebration />} />
          <Route path="/profile" element={<p>perfil</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return client
}

describe('PodiumCelebration', () => {
  beforeEach(() => {
    get.mockReset().mockReturnValue(new Promise(() => {}))
    post.mockReset().mockResolvedValue(undefined)
  })

  it('stays away from everyone off the podium', () => {
    renderWith(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('celebrates the champion and remembers it was seen', async () => {
    const user = userEvent.setup()
    const client = renderWith({
      season: { number: 2, name: 'setembro de 2026' },
      final_xp: 4200,
      position: 1,
    })

    const dialog = screen.getByRole('dialog', { name: 'Campeão da temporada de setembro de 2026' })
    expect(dialog).toHaveTextContent('Você terminou em 1º lugar com 4.200 XP')

    await user.click(screen.getByRole('button', { name: 'Ver meu troféu' }))

    expect(post).toHaveBeenCalledWith('/users/me/podium-celebration')
    expect(client.getQueryData<DashboardData>(['dashboard'])?.podium_celebration).toBeNull()
    expect(await screen.findByText('perfil')).toBeInTheDocument()
  })

  it('celebrates 2nd place with the silver trophy', () => {
    renderWith({ season: { number: 2, name: 'setembro de 2026' }, final_xp: 3100, position: 2 })

    const dialog = screen.getByRole('dialog', { name: '2º lugar da temporada de setembro de 2026' })
    expect(dialog).toHaveTextContent('Você terminou em 2º lugar com 3.100 XP')
    expect(dialog).toHaveTextContent('Seu troféu de prata da tribo de Issacar já está no perfil.')
  })

  it('celebrates 3rd place with the bronze trophy', () => {
    renderWith({ season: { number: 2, name: 'setembro de 2026' }, final_xp: 2500, position: 3 })

    expect(
      screen.getByRole('dialog', { name: '3º lugar da temporada de setembro de 2026' })
    ).toHaveTextContent('Seu troféu de bronze da tribo de Issacar')
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerProfile } from '@/types/api'
import { PlayerProfileModal } from './PlayerProfileModal'

const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    user: {
      id: 'p1',
      username: 'maria',
      name: 'Maria Souza',
      level: 12,
      rank: { code: 'videira', name: 'Videira' },
      duel_wins: 6,
      duel_losses: 3,
      duel_draws: 1,
    },
    relation: 'friends',
    member_since: '2026-09',
    stats: {
      total_xp: 3400,
      xp_into_level: 350,
      xp_for_next_level: 650,
      current_streak: 5,
      longest_streak: 12,
      questions_answered: 420,
      accuracy: 0.87,
      perfect_sessions: 9,
    },
    achievements_unlocked: 8,
    achievements_total: 32,
    recent_achievements: [
      { code: 'streak_7', name: 'Uma semana no deserto' },
      { code: 'duel_win_1', name: 'Pedra e funda' },
    ],
    strongest_categories: [
      { slug: 'profetas', name: 'Profetas', icon: '📢', accuracy: 0.92, answered: 40 },
    ],
    ...overrides,
  }
}

function renderModal(userId: string | null = 'p1', onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PlayerProfileModal userId={userId} onClose={onClose} />
    </QueryClientProvider>
  )
  return onClose
}

describe('PlayerProfileModal', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(profile())
  })

  it('stays closed and fetches nothing without a player', () => {
    renderModal(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })

  it('shows the player’s level, stats and details', async () => {
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: 'Perfil de Maria Souza' })
    const view = within(dialog)

    expect(get).toHaveBeenCalledWith('/players/p1')
    expect(view.getByText('@maria')).toBeInTheDocument()
    expect(view.getByText('Amigo')).toBeInTheDocument()
    expect(view.getByText('Videira · Nível 12')).toBeInTheDocument()
    expect(view.getByText(/3\.400 XP · faltam 300 para o nível 13/)).toBeInTheDocument()
    expect(view.getByText('5 dias')).toBeInTheDocument()
    expect(view.getByText('recorde 12')).toBeInTheDocument()
    expect(view.getByText('87%')).toBeInTheDocument()
    expect(view.getByText('420 respondidas')).toBeInTheDocument()
    expect(view.getByText('6V 1E 3D')).toBeInTheDocument()
    expect(view.getByText('60% de vitórias')).toBeInTheDocument()
    expect(view.getByText('Conquistas · 8 de 32')).toBeInTheDocument()
    expect(view.getByText('Pedra e funda')).toBeInTheDocument()
    expect(view.getByText('Profetas')).toBeInTheDocument()
    expect(view.getByText('92%')).toBeInTheDocument()
    expect(view.getByText('Joga desde setembro de 2026')).toBeInTheDocument()
  })

  it('shows what the tapped row knows while the profile loads', async () => {
    get.mockReturnValue(new Promise(() => {}))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <PlayerProfileModal userId="p1" preview={profile().user} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    const dialog = await screen.findByRole('dialog', { name: 'Perfil do jogador' })
    const view = within(dialog)
    expect(view.getByText('Maria Souza')).toBeInTheDocument()
    expect(view.getByText('@maria')).toBeInTheDocument()
    expect(view.getByText('Videira · Nível 12')).toBeInTheDocument()
    // Stats wait for the request: placeholders, not made-up numbers.
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(view.queryByText('Sequência')).not.toBeInTheDocument()
  })

  it('never renders personal data, even if the payload carried some', async () => {
    get.mockResolvedValue({ ...profile(), email: 'maria.privada@teste.com', timezone: 'Europe/Lisbon' })
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: 'Perfil de Maria Souza' })
    expect(dialog).not.toHaveTextContent('maria.privada@teste.com')
    expect(dialog).not.toHaveTextContent('Europe/Lisbon')
  })

  it('handles a brand-new player gracefully', async () => {
    get.mockResolvedValue(
      profile({
        relation: 'none',
        user: { ...profile().user, duel_wins: 0, duel_losses: 0, duel_draws: 0 },
        stats: { ...profile().stats, accuracy: null, current_streak: 1, questions_answered: 0 },
        achievements_unlocked: 0,
        recent_achievements: [],
        strongest_categories: [],
      })
    )
    renderModal()
    const view = within(await screen.findByRole('dialog', { name: 'Perfil de Maria Souza' }))
    expect(view.getByText('—')).toBeInTheDocument()
    expect(view.getByText('1 dia')).toBeInTheDocument()
    expect(view.getByText('nenhum ainda')).toBeInTheDocument()
    expect(view.getByText('Nenhuma ainda.')).toBeInTheDocument()
    expect(view.queryByText('Mais forte em')).not.toBeInTheDocument()
    expect(view.queryByText('Amigo')).not.toBeInTheDocument()
  })

  it('labels the player’s own profile', async () => {
    get.mockResolvedValue(profile({ relation: 'self' }))
    renderModal()
    expect(await screen.findByText('Você')).toBeInTheDocument()
  })

  it('explains when the profile cannot be loaded', async () => {
    const { ApiError } = await import('@/lib/api')
    get.mockRejectedValue(new ApiError(404, 'Jogador não encontrado'))
    renderModal()
    expect(await screen.findByText('Jogador não encontrado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('closes from the button', async () => {
    const user = userEvent.setup()
    const onClose = renderModal()
    await screen.findByRole('dialog', { name: 'Perfil de Maria Souza' })
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalled()
  })
})

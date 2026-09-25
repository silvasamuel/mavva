import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FriendsOverview, PlayerProfile, PublicUser } from '@/types/api'
import { FriendsPage } from './FriendsPage'

const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}))

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'samuel' } }),
}))

const joao: PublicUser = {
  id: 'u-joao',
  username: 'joao',
  name: 'João Lima',
  level: 8,
  rank: { code: 'espiga', name: 'Espiga' },
  duel_wins: 2,
  duel_losses: 1,
  duel_draws: 0,
}

const overview: FriendsOverview = { friends: [joao], incoming: [], sent: [] }

const joaoProfile: PlayerProfile = {
  user: joao,
  relation: 'friends',
  member_since: '2026-03',
  stats: {
    total_xp: 1800,
    xp_into_level: 100,
    xp_for_next_level: 450,
    current_streak: 3,
    longest_streak: 9,
    questions_answered: 150,
    accuracy: 0.8,
    perfect_sessions: 4,
  },
  achievements_unlocked: 5,
  achievements_total: 32,
  recent_achievements: [],
  strongest_categories: [],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <FriendsPage />
    </QueryClientProvider>
  )
}

describe('FriendsPage', () => {
  beforeEach(() => {
    get.mockReset().mockImplementation(async (path: string) => {
      if (path === '/friends') return overview
      if (path === '/players/u-joao') return joaoProfile
      throw new Error(`unexpected ${path}`)
    })
  })

  it('opens a friend’s profile when the friend is tapped', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /joão lima/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Perfil de João Lima' })
    expect(within(dialog).getByText('Espiga · Nível 8')).toBeInTheDocument()
    expect(within(dialog).getByText('80%')).toBeInTheDocument()
  })

  it('keeps “Remover” as its own action instead of opening the profile', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Remover' }))

    expect(await screen.findByRole('dialog', { name: 'Remover amigo' })).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/players/u-joao')
  })
})

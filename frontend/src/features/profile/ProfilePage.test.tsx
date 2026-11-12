import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData, User } from '@/types/api'
import { seasonDashboard } from '@/features/dashboard/seasonFixture'
import { ProfilePage } from './ProfilePage'

const get = vi.fn()
const post = vi.fn()

const user: User = {
  id: 'u1',
  name: 'Samuel Silva',
  username: 'samuel',
  email: 'samuel@teste.com',
  role: 'user',
  timezone: 'America/Sao_Paulo',
  daily_goal_xp: 50,
  review_spacing: 'balanced',
  review_scope: 'all',
  review_order: 'oldest',
  review_session_size: 10,
  review_max_interval_days: null,
  tutorial_completed: true,
  is_supporter: false,
  supporter_since: null,
  supporter_until: null,
  supporter_months: 0,
}

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user, logout: vi.fn(), updateUser: vi.fn() }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  ApiError: class ApiError extends Error {},
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProfilePage tutorial replay', () => {
  beforeEach(() => {
    get.mockReset().mockReturnValue(new Promise(() => {}))
    post.mockReset()
  })

  it('"Rever tutorial" opens it again without touching the server', async () => {
    const actor = userEvent.setup()
    renderPage()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The tutorial lives in the account section, which needs no server data.
    await actor.click(screen.getByRole('tab', { name: 'Conta' }))
    const replay = screen.getByRole('button', { name: 'Rever tutorial' })
    await actor.click(replay)
    const dialog = screen.getByRole('dialog', { name: 'Tutorial do Mavva' })
    expect(within(dialog).getByText('Passo 1 de 8')).toBeInTheDocument()
    await actor.click(within(dialog).getByRole('button', { name: 'Próximo' }))
    expect(within(dialog).getByText('Passo 2 de 8')).toBeInTheDocument()

    await actor.click(within(dialog).getByRole('button', { name: 'Pular' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(replay).toHaveFocus()
    expect(post).not.toHaveBeenCalled()

    // And it starts from the first step every time.
    await actor.click(replay)
    expect(within(screen.getByRole('dialog')).getByText('Passo 1 de 8')).toBeInTheDocument()
  })
})

function dashboard(): DashboardData {
  const base = seasonDashboard()
  return {
    ...base,
    stats: {
      ...base.stats,
      total_xp: 1234,
      current_streak: 3,
      longest_streak: 9,
      questions_answered: 80,
      correct_answers: 60,
      accuracy: 0.75,
      perfect_sessions: 2,
      total_time_seconds: 3720,
      trophies: [],
      wisdom: { level: 4, max_level: 10, points: 120, level_floor: 100, next_level_at: 200 },
      contributor: { tier: 'bronze', contributions: 2, next_tier: 'silver', next_tier_at: 5 },
    },
    categories: [
      {
        id: 1,
        slug: 'reis',
        name: 'Reis',
        icon: '👑',
        description: '',
        answered: 10,
        accuracy: 0.4,
      },
      {
        id: 2,
        slug: 'profetas',
        name: 'Profetas',
        icon: '📣',
        description: '',
        answered: 20,
        accuracy: 0.9,
      },
      {
        id: 3,
        slug: 'cartas',
        name: 'Cartas',
        icon: '✉️',
        description: '',
        answered: 0,
        accuracy: null,
      },
    ],
    duels: {
      wins: 3,
      losses: 1,
      draws: 0,
      current_streak: 1,
      best_streak: 2,
      win_rate: 0.75,
      awaiting_me: 0,
    },
  } as DashboardData
}

describe('ProfilePage tabs', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(dashboard())
    post.mockReset()
  })

  it('opens on the seals and shows one section at a time', async () => {
    const actor = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Sabedoria · nível 4 de 10')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Selos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Seus dados')).not.toBeInTheDocument()
    expect(screen.queryByText('Por categoria')).not.toBeInTheDocument()

    await actor.click(screen.getByRole('tab', { name: 'Temporadas' }))
    expect(screen.getByText('Maior elo')).toBeInTheDocument()
    expect(screen.queryByText('Sabedoria · nível 4 de 10')).not.toBeInTheDocument()

    await actor.click(screen.getByRole('tab', { name: 'Conta' }))
    expect(screen.getByText('Seus dados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeInTheDocument()
  })

  it('shows the player’s numbers and every practiced category, best first', async () => {
    const actor = userEvent.setup()
    renderPage()
    await actor.click(await screen.findByRole('tab', { name: 'Estatísticas' }))

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('3 dias')).toBeInTheDocument()
    expect(within(panel).getByText('recorde 9')).toBeInTheDocument()
    expect(within(panel).getByText('75%')).toBeInTheDocument()
    expect(within(panel).getByText('80 respondidas')).toBeInTheDocument()
    expect(within(panel).getByText('3V 0E 1D')).toBeInTheDocument()
    expect(within(panel).getByText('1.234')).toBeInTheDocument()
    expect(within(panel).getByText('Tempo de estudo')).toBeInTheDocument()

    const categories = within(panel)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(categories).toHaveLength(2)
    expect(categories[0]).toContain('Profetas')
    expect(categories[0]).toContain('90%')
    expect(categories[1]).toContain('Reis')
  })

  it('keeps what was typed in the account form while visiting another tab', async () => {
    const actor = userEvent.setup()
    renderPage()
    await actor.click(await screen.findByRole('tab', { name: 'Conta' }))
    const name = screen.getByLabelText('Nome')
    await actor.clear(name)
    await actor.type(name, 'Samuel Editado')

    await actor.click(screen.getByRole('tab', { name: 'Selos' }))
    await actor.click(screen.getByRole('tab', { name: 'Conta' }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Samuel Editado')
  })

  it('moves between tabs with the arrow keys', async () => {
    const actor = userEvent.setup()
    renderPage()
    const first = await screen.findByRole('tab', { name: 'Selos' })
    first.focus()
    await actor.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Temporadas' })).toHaveFocus()
    await actor.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Conta' })).toHaveAttribute('aria-selected', 'true')
  })
})

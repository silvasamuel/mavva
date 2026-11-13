import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData } from '@/types/api'
import { DashboardPage } from './DashboardPage'
import { seasonDashboard } from './seasonFixture'

const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args), post: vi.fn() },
}))

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Maria Souza' } }),
}))

function category(id: number, name: string, answered: number, accuracy: number | null) {
  return { id, slug: name.toLowerCase(), name, icon: '📖', description: '', answered, accuracy }
}

function dashboard(): DashboardData {
  const base = seasonDashboard()
  return {
    ...base,
    stats: { ...base.stats, questions_answered: 60, accuracy: 0.8, perfect_sessions: 2 },
    last_season_podium: null,
    podium_celebration: null,
    daily_goal: { target: 50, earned_today: 10, achieved: false },
    evolution: [],
    categories: [
      category(1, 'Profetas', 20, 0.9),
      category(2, 'Reis', 20, 0.4),
      category(3, 'Milagres', 20, 0.65),
      category(4, 'Cartas', 0, null),
    ],
    recent_sessions: [],
    reviews_due: 0,
    friend_requests: 0,
    notifications_unread: 0,
    duels: {
      wins: 0,
      losses: 0,
      draws: 0,
      current_streak: 0,
      best_streak: 0,
      win_rate: null,
      awaiting_me: 0,
    },
    recommendations: [],
  } as DashboardData
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function listedCategories(): string[] {
  const heading = screen.getByRole('heading', { name: 'Categorias' })
  const section = heading.closest('section') as HTMLElement
  return within(section)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(/\d+%$/, '') ?? '')
}

describe('DashboardPage categories', () => {
  beforeEach(() => {
    localStorage.clear()
    get.mockReset().mockResolvedValue(dashboard())
  })

  it('shows the best categories first and can flip to the worst', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument()
    expect(listedCategories()).toEqual(['Profetas', 'Milagres', 'Reis'])
    expect(screen.getByRole('radio', { name: 'Melhores' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Piores' }))

    expect(listedCategories()).toEqual(['Reis', 'Milagres', 'Profetas'])
    expect(localStorage.getItem('mavva:category-order')).toBe('worst')
  })

  it('remembers the chosen order on the next visit', async () => {
    localStorage.setItem('mavva:category-order', 'worst')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Piores' })).toBeChecked()
    expect(listedCategories()[0]).toBe('Reis')
  })
})

describe('DashboardPage shortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('offers Revisar, Duelar and Ligas', async () => {
    get.mockReset().mockResolvedValue(dashboard())
    renderPage()
    const leagues = await screen.findByRole('button', { name: /Ligas/ })
    expect(leagues).toHaveTextContent('Jogue com a turma')
    expect(screen.getByRole('button', { name: /Revisar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Duelar/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Troféus/ })).not.toBeInTheDocument()
  })

  it('counts league invites and turns waiting', async () => {
    get.mockReset().mockResolvedValue({ ...dashboard(), leagues_pending: 2 })
    renderPage()
    expect(await screen.findByRole('button', { name: /Ligas/ })).toHaveTextContent('2 à sua espera')
  })
})

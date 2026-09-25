import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewSummary, User } from '@/types/api'
import { ReviewPage } from './ReviewPage'

const get = vi.fn()
const patch = vi.fn()
const post = vi.fn()
const updateUser = vi.fn()
let currentUser: User

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
    post: (...args: unknown[]) => post(...args),
  },
  ApiError: class ApiError extends Error {},
}))

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, updateUser }),
}))

const PREVIEW: ReviewSummary['spacing_preview'] = {
  intensive: [1, 2, 3, 4, 6],
  balanced: [1, 3, 8, 21, 57],
  relaxed: [3, 7, 18, 48, 130],
}

function summary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return { due_today: 2, due_this_week: 5, total_items: 9, spacing_preview: PREVIEW, ...overrides }
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Samuel',
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
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function timeline() {
  return screen.getByRole('list', { name: /intervalo até a pergunta voltar/i })
}

describe('ReviewPage', () => {
  beforeEach(() => {
    currentUser = makeUser()
    get.mockReset().mockResolvedValue(summary())
    patch.mockReset().mockImplementation(async (_path: string, body: Partial<User>) => ({
      ...currentUser,
      ...body,
    }))
    post.mockReset()
    updateUser.mockReset()
  })

  it('explains the selected spacing with the scheduler’s own numbers', async () => {
    renderPage()
    const steps = within(await screen.findByRole('list', { name: /intervalo/i }))
    for (const label of ['1 dia', '3 dias', '8 dias', '21 dias', '57 dias']) {
      expect(steps.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(/errou\? volta amanhã e o intervalo recomeça/i)).toBeInTheDocument()
  })

  it('updates the explanation as soon as another spacing is picked, and saves it', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('list', { name: /intervalo/i })

    await user.click(screen.getByRole('button', { name: /^Leve/ }))

    const steps = within(timeline())
    expect(steps.getByText('48 dias')).toBeInTheDocument()
    expect(steps.getByText('~4 meses')).toBeInTheDocument()
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/users/me',
        expect.objectContaining({ review_spacing: 'relaxed' })
      )
    )
  })

  it('mentions the max interval when one is set', async () => {
    currentUser = makeUser({ review_max_interval_days: 30 })
    get.mockResolvedValue(
      summary({ spacing_preview: { ...PREVIEW, balanced: [1, 3, 8, 21, 30] } })
    )
    renderPage()
    expect(await screen.findByText(/nenhum intervalo passa de 30 dias/i)).toBeInTheDocument()
  })

  it('refreshes the counters after a setting that changes what is due', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('button', { name: 'Revisar 2 perguntas' })).toBeInTheDocument()

    get.mockResolvedValue(summary({ due_today: 1, total_items: 4 }))
    await user.click(screen.getByRole('button', { name: 'Só o que eu erro' }))

    expect(await screen.findByRole('button', { name: 'Revisar 1 pergunta' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('explains what each counter counts', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('list', { name: /intervalo/i })

    await user.click(screen.getByRole('button', { name: 'O que conta em nesta semana' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Tudo que vence de hoje até daqui a 6 dias'
    )
  })

  it('tells the player how many questions a session takes', async () => {
    const user = userEvent.setup()
    currentUser = makeUser({ review_session_size: 15 })
    renderPage()
    await screen.findByRole('list', { name: /intervalo/i })

    await user.click(screen.getByRole('button', { name: 'O que conta em para hoje' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cada revisão traz até 15')
  })
})

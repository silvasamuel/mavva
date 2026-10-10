import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types/api'
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

    const replay = screen.getByRole('button', { name: 'Rever tutorial' })
    await actor.click(replay)
    const dialog = screen.getByRole('dialog', { name: 'Tutorial do Mavva' })
    expect(within(dialog).getByText('Passo 1 de 6')).toBeInTheDocument()
    await actor.click(within(dialog).getByRole('button', { name: 'Próximo' }))
    expect(within(dialog).getByText('Passo 2 de 6')).toBeInTheDocument()

    await actor.click(within(dialog).getByRole('button', { name: 'Pular' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(replay).toHaveFocus()
    expect(post).not.toHaveBeenCalled()

    // And it starts from the first step every time.
    await actor.click(replay)
    expect(within(screen.getByRole('dialog')).getByText('Passo 1 de 6')).toBeInTheDocument()
  })
})

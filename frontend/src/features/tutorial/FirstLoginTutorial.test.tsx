import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types/api'
import { AppShell } from '@/app/AppShell'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

const get = vi.fn()
const post = vi.fn()

// The real AuthProvider restores the session through these, so the tests
// exercise the cached user the way the app does.
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  tryRefresh: async () => 'ok',
  setAccessToken: () => {},
  setOnSessionExpired: () => {},
  API_URL: '',
  ApiError: class ApiError extends Error {},
}))

const PENDING_KEY = 'mavva:tutorial-pending:u1'

function makeUser(overrides: Partial<User> = {}): User {
  return {
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
    tutorial_completed: false,
    ...overrides,
  }
}

let serverUser: User

function Home() {
  const { user } = useAuth()
  return <p>{user ? `Olá, ${user.username}` : 'Carregando'}</p>
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/quiz/new" element={<p>Página de estudo</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function openTutorial() {
  renderShell()
  return screen.findByRole('dialog', { name: 'Tutorial do Mavva' })
}

async function goToLastStep(dialog: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  for (let step = 1; step < 6; step++) {
    await user.click(within(dialog).getByRole('button', { name: 'Próximo' }))
  }
}

describe('FirstLoginTutorial', () => {
  beforeEach(() => {
    window.localStorage.clear()
    serverUser = makeUser()
    get.mockReset().mockImplementation(async (path: string) => {
      if (path === '/users/me') return serverUser
      return new Promise(() => {}) // dashboard: the HUD just keeps loading
    })
    post.mockReset().mockImplementation(async () => {
      serverUser = { ...serverUser, tutorial_completed: true }
      return serverUser
    })
  })

  it('opens for a player who has not seen it, with focus inside', async () => {
    const dialog = await openTutorial()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Passo 1 de 6')).toBeInTheDocument()
    expect(within(dialog).getByText('Que bom ter você aqui, Samuel!')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Próximo' })).toHaveFocus()
  })

  it('stays closed for a player who already completed it', async () => {
    serverUser = makeUser({ tutorial_completed: true })
    renderShell()
    expect(await screen.findByText('Olá, samuel')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('moves through the steps with Próximo and Voltar', async () => {
    const user = userEvent.setup()
    const dialog = await openTutorial()
    const view = within(dialog)
    expect(view.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()

    await user.click(view.getByRole('button', { name: 'Próximo' }))
    expect(view.getByText('Passo 2 de 6')).toBeInTheDocument()
    expect(view.getByText('Meta diária e sequência')).toBeInTheDocument()

    await user.click(view.getByRole('button', { name: 'Voltar' }))
    expect(view.getByText('Passo 1 de 6')).toBeInTheDocument()
    // Voltar is gone on the first step, so focus lands on Próximo.
    expect(view.getByRole('button', { name: 'Próximo' })).toHaveFocus()

    await goToLastStep(dialog, user)
    expect(view.getByText('Passo 6 de 6')).toBeInTheDocument()
    expect(view.queryByRole('button', { name: 'Próximo' })).not.toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Fazer meu primeiro quiz' })).toHaveFocus()
    expect(view.getByRole('button', { name: 'Explorar o app' })).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('Pular saves it and closes for good', async () => {
    const user = userEvent.setup()
    const dialog = await openTutorial()
    await user.click(within(dialog).getByRole('button', { name: 'Próximo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Pular' }))

    expect(post).toHaveBeenCalledWith('/users/me/tutorial')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('the final CTA saves it, closes and opens a new quiz', async () => {
    const user = userEvent.setup()
    const dialog = await openTutorial()
    await goToLastStep(dialog, user)
    await user.click(within(dialog).getByRole('button', { name: 'Fazer meu primeiro quiz' }))

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/users/me/tutorial')
    expect(await screen.findByText('Página de estudo')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('"Explorar o app" saves it and stays on the page', async () => {
    const user = userEvent.setup()
    const dialog = await openTutorial()
    await goToLastStep(dialog, user)
    await user.click(within(dialog).getByRole('button', { name: 'Explorar o app' }))

    expect(post).toHaveBeenCalledWith('/users/me/tutorial')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Olá, samuel')).toBeInTheDocument()
  })

  it('Escape skips it', async () => {
    const user = userEvent.setup()
    await openTutorial()
    await user.keyboard('{Escape}')

    expect(post).toHaveBeenCalledWith('/users/me/tutorial')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('works with the keyboard alone and keeps Tab inside the dialog', async () => {
    const user = userEvent.setup()
    const dialog = await openTutorial()
    await user.keyboard('{Enter}')
    expect(within(dialog).getByText('Passo 2 de 6')).toBeInTheDocument()

    for (let press = 0; press < 5; press++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes anyway when saving fails, then saves silently on the next visit', async () => {
    const user = userEvent.setup()
    post.mockRejectedValueOnce(new Error('offline'))
    const first = renderShell()
    const dialog = await screen.findByRole('dialog', { name: 'Tutorial do Mavva' })
    await user.click(within(dialog).getByRole('button', { name: 'Pular' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).toBe('1'))
    first.unmount()

    // Next visit: the server still says false, but the player already went through it.
    expect(serverUser.tutorial_completed).toBe(false)
    renderShell()
    expect(await screen.findByText('Olá, samuel')).toBeInTheDocument()
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).toBeNull())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

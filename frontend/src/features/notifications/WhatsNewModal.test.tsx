import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData, NotificationItem } from '@/types/api'
import { seasonDashboard } from '@/features/dashboard/seasonFixture'
import { WhatsNewModal } from './WhatsNewModal'

const get = vi.fn()
const post = vi.fn()
let tutorialCompleted = true

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}))

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', tutorial_completed: tutorialCompleted } }),
}))

function item(id: string, title: string, unread = true): NotificationItem {
  return {
    id,
    title,
    body: `Detalhes de ${title}.\nSegunda linha.`,
    kind: 'feature',
    published_at: '2026-11-11T12:00:00Z',
    unread,
  }
}

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ...seasonDashboard(),
    podium_celebration: null,
    notifications_unread: 1,
    ...overrides,
  } as DashboardData
}

function renderModal(data: DashboardData) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['dashboard'], data)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WhatsNewModal data={data} />} />
          <Route path="/notifications" element={<p>tela de novidades</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return client
}

describe('WhatsNewModal', () => {
  beforeEach(() => {
    tutorialCompleted = true
    get.mockReset()
    post.mockReset().mockResolvedValue(undefined)
  })

  it('shows the unread announcement and marks it read when closed', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue({
      items: [item('a', 'Selos novos'), item('b', 'Notícia antiga', false)],
      unread_count: 1,
    })
    const client = renderModal(dashboard())

    const dialog = await screen.findByRole('dialog', { name: 'Novidades no Mavva' })
    expect(dialog).toHaveTextContent('Tem novidade no Mavva')
    expect(dialog).toHaveTextContent('Selos novos')
    expect(dialog).toHaveTextContent('Segunda linha.')
    expect(dialog).not.toHaveTextContent('Notícia antiga')

    await user.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(post).toHaveBeenCalledWith('/notifications/seen')
    expect(client.getQueryData<DashboardData>(['dashboard'])?.notifications_unread).toBe(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not even ask the server when nothing is unread', () => {
    renderModal(dashboard({ notifications_unread: 0 }))
    expect(get).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits behind the season notice, the podium celebration and the tutorial', () => {
    renderModal(dashboard({ season_notice: 'start' }))
    renderModal(
      dashboard({
        podium_celebration: {
          season: { number: 1, name: 'outubro de 2026' },
          final_xp: 100,
          position: 1,
        },
      })
    )
    tutorialCompleted = false
    renderModal(dashboard())
    expect(get).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('caps the list and points to the Novidades screen for the rest', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue({
      items: ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'].map((title, index) =>
        item(String(index), title)
      ),
      unread_count: 5,
    })
    renderModal(dashboard({ notifications_unread: 5 }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('5 novidades no Mavva')
    expect(dialog).toHaveTextContent('Três')
    expect(dialog).not.toHaveTextContent('Quatro')
    expect(dialog).toHaveTextContent('E mais 2 novidades na tela de Novidades.')

    await user.click(screen.getByRole('button', { name: 'Ver todas as novidades' }))
    expect(post).toHaveBeenCalledWith('/notifications/seen')
    expect(await screen.findByText('tela de novidades')).toBeInTheDocument()
  })
})

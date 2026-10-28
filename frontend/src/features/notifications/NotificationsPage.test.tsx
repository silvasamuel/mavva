import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData, NotificationFeed } from '@/types/api'
import { NotificationsPage } from './NotificationsPage'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  ApiError: class ApiError extends Error {},
}))

function feed(overrides: Partial<NotificationFeed> = {}): NotificationFeed {
  return {
    items: [
      {
        id: 'n2',
        title: 'Duelos em trio',
        body: 'Agora dá para\nduelar em trio.',
        kind: 'feature',
        published_at: new Date().toISOString(),
        unread: true,
      },
      {
        id: 'n1',
        title: 'Ranking mais rápido',
        body: 'Carrega na hora.',
        kind: 'improvement',
        published_at: '2026-10-01T12:00:00Z',
        unread: false,
      },
    ],
    unread_count: 1,
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['dashboard'], { notifications_unread: 1 } as DashboardData)
  render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>
  )
  return client
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(feed())
    post.mockReset().mockResolvedValue(undefined)
  })

  it('lists the news newest first, tagging what is new', async () => {
    renderPage()
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Duelos em trio')).toBeInTheDocument()
    expect(within(items[0]).getByText('Novidade')).toBeInTheDocument()
    expect(within(items[0]).getByText('Nova')).toBeInTheDocument()
    expect(within(items[0]).getByText('hoje')).toBeInTheDocument()
    expect(within(items[1]).getByText('Melhoria')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Nova')).not.toBeInTheDocument()
  })

  it('marks everything as read and clears the bell badge', async () => {
    const client = renderPage()
    await screen.findByText('Duelos em trio')
    expect(post).toHaveBeenCalledWith('/notifications/seen')
    expect(client.getQueryData<DashboardData>(['dashboard'])?.notifications_unread).toBe(0)
  })

  it('does not call the server when nothing is unread', async () => {
    get.mockResolvedValue(feed({ unread_count: 0 }))
    renderPage()
    await screen.findByText('Duelos em trio')
    expect(post).not.toHaveBeenCalled()
  })

  it('has a friendly empty state', async () => {
    get.mockResolvedValue({ items: [], unread_count: 0 })
    renderPage()
    expect(await screen.findByText('Nada novo por aqui ainda')).toBeInTheDocument()
  })
})

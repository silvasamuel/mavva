import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { AdminSupport } from './types'
import { SupportPanel } from './SupportPanel'

const get = vi.fn()
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }))

const overview: AdminSupport = {
  total_cents: 4600,
  approved_count: 3,
  pending_count: 1,
  active_supporters: 2,
  donors: [
    {
      user_id: 'u2',
      username: 'joao',
      name: 'João',
      total_cents: 3100,
      donations: 1,
      last_donation_at: '2026-11-06T12:00:00Z',
      supporter_until: '2027-01-05T12:00:00Z',
      is_supporter: true,
    },
    {
      user_id: 'u1',
      username: 'maria',
      name: 'Maria',
      total_cents: 1500,
      donations: 2,
      last_donation_at: '2026-10-01T12:00:00Z',
      supporter_until: '2026-10-31T12:00:00Z',
      is_supporter: false,
    },
  ],
  recent: [
    {
      id: 'p1',
      user_id: 'u1',
      username: 'maria',
      name: 'Maria',
      amount_cents: 700,
      status: 'pending',
      provider: 'mercadopago',
      provider_payment_id: 'ORD01ABC',
      created_at: '2026-11-06T13:00:00Z',
      approved_at: null,
    },
  ],
}

describe('SupportPanel', () => {
  it('shows totals, the per-player table and the latest charges', async () => {
    get.mockResolvedValue(overview)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SupportPanel />
      </QueryClientProvider>
    )

    expect(await screen.findByText('R$ 46,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 31,00')).toBeInTheDocument()
    expect(screen.getByText(/Ativo até/)).toBeInTheDocument()
    expect(screen.getByText(/Venceu em/)).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText('ORD01ABC', { exact: false })).toBeInTheDocument()
  })
})

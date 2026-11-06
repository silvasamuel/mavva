import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupportPayment, SupportSummary } from '@/types/api'
import { SupportPage } from './SupportPage'

const get = vi.fn()
const post = vi.fn()
const updateUser = vi.fn()

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) },
  }
})

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      name: 'Maria',
      is_supporter: false,
      supporter_since: null,
      supporter_until: null,
    },
    updateUser,
  }),
}))

function pending(overrides: Partial<SupportPayment> = {}): SupportPayment {
  return {
    id: 'p1',
    amount_cents: 1000,
    status: 'pending',
    supporter_days: 30,
    provider: 'fake',
    qr_code: '00020126MAVVA6304FAKE',
    ticket_url: null,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    approved_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function summary(last: SupportPayment | null = null): SupportSummary {
  return {
    is_supporter: false,
    supporter_since: null,
    supporter_until: null,
    total_cents: 0,
    last_payment: last,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SupportPage />
    </QueryClientProvider>
  )
}

describe('SupportPage', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    updateUser.mockReset()
  })

  it('creates a Pix for the chosen amount and shows the code', async () => {
    const user = userEvent.setup()
    get.mockImplementation((path: string) =>
      path === '/support/me' ? Promise.resolve(summary()) : Promise.resolve(pending())
    )
    post.mockResolvedValue(pending({ amount_cents: 2000 }))
    renderPage()

    await user.click(await screen.findByRole('radio', { name: 'R$ 20,00 +30 dias' }))
    await user.click(screen.getByRole('button', { name: 'Gerar Pix de R$ 20,00' }))

    expect(post).toHaveBeenCalledWith('/support/payments', { amount_cents: 2000 })
    expect(await screen.findByRole('img', { name: 'QR Code do Pix' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('00020126MAVVA6304FAKE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simular pagamento (dev)' })).toBeInTheDocument()
  })

  it('refuses amounts outside the allowed range', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue(summary())
    renderPage()

    await user.type(await screen.findByLabelText('Ou outro valor (R$)'), '0,50')
    expect(screen.getByText(/entre R\$ 5,00 e R\$ 1.000,00/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar Pix' })).toBeDisabled()
  })

  it('resumes a pending Pix and celebrates once it is paid', async () => {
    const open = pending()
    get.mockImplementation((path: string) => {
      if (path === '/support/me') return Promise.resolve(summary(open))
      if (path === '/users/me') {
        return Promise.resolve({
          id: 'u1',
          name: 'Maria',
          is_supporter: true,
          supporter_since: '2026-11-06T12:00:00Z',
          supporter_until: '2026-12-06T12:00:00Z',
        })
      }
      return Promise.resolve(open)
    })
    post.mockResolvedValue({
      ...open,
      status: 'approved',
      approved_at: '2026-11-06T12:00:00Z',
    })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Simular pagamento (dev)' }))

    expect(await screen.findByText('Oferta recebida!')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('ganhou 30 dias')
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ is_supporter: true, supporter_until: '2026-12-06T12:00:00Z' })
      )
    )
  })
})

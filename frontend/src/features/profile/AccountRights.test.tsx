import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountRights } from './AccountRights'

const logout = vi.fn()
const apiGet = vi.fn()
const apiDelete = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ logout }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    delete: (...args: unknown[]) => apiDelete(...args),
  },
  ApiError: class ApiError extends Error {
    status = 403
  },
}))

describe('AccountRights', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue(undefined)
    apiGet.mockReset().mockResolvedValue({ user: { email: 'ana@teste.com' } })
    apiDelete.mockReset().mockResolvedValue(undefined)
    URL.createObjectURL = vi.fn(() => 'blob:mavva')
    URL.revokeObjectURL = vi.fn()
  })

  it('downloads an export and deletes only after the password is confirmed', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountRights />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /baixar meus dados/i }))
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/users/me/export'))
    expect(await screen.findByText(/cópia dos seus dados baixada/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /apagar conta/i }))
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    await user.click(screen.getByRole('button', { name: /apagar definitivamente/i }))

    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith('/users/me', { password: 'senha-forte-123' })
    )
    expect(logout).toHaveBeenCalled()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountRights } from './AccountRights'

const logout = vi.fn()
const apiDelete = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ logout }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    delete: (...args: unknown[]) => apiDelete(...args),
  },
  ApiError: class ApiError extends Error {
    status = 403
  },
}))

describe('AccountRights', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue(undefined)
    apiDelete.mockReset().mockResolvedValue(undefined)
  })

  it('has no self-service export — only account deletion', () => {
    render(
      <MemoryRouter>
        <AccountRights />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: /baixar meus dados/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apagar conta/i })).toBeInTheDocument()
  })

  it('keeps the confirm button disabled until both the typed word and the password are given', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountRights />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /^apagar conta$/i }))
    const confirmButton = screen.getByRole('button', { name: /apagar definitivamente/i })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText(/digite apagar para confirmar/i), 'apagar')
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)
    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith('/users/me', { password: 'senha-forte-123' })
    )
    expect(logout).toHaveBeenCalled()
  })

  it('does not delete when only the password is filled without the confirm word', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountRights />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /^apagar conta$/i }))
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    expect(screen.getByRole('button', { name: /apagar definitivamente/i })).toBeDisabled()
    expect(apiDelete).not.toHaveBeenCalled()
  })

  it('clears the typed password when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountRights />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /^apagar conta$/i }))
    await user.type(screen.getByLabelText(/digite apagar para confirmar/i), 'APAGAR')
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    await user.click(screen.getByRole('button', { name: /^apagar conta$/i }))
    expect(screen.getByLabelText('Senha')).toHaveValue('')
    expect(screen.getByLabelText(/digite apagar para confirmar/i)).toHaveValue('')
  })
})

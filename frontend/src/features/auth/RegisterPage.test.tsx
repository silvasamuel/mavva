import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterPage } from './RegisterPage'

const register = vi.fn()

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: null, register }),
}))

function renderRegister() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/termos" element={<p>Termos de Uso</p>} />
          <Route path="/privacidade" element={<p>Política de Privacidade</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RegisterPage consent', () => {
  beforeEach(() => {
    register.mockReset()
    register.mockResolvedValue({ retry_after: 60 })
  })

  it('keeps submit disabled until the form is complete and terms are accepted', async () => {
    const user = userEvent.setup()
    renderRegister()

    const submit = screen.getByRole('button', { name: /criar conta/i })
    expect(submit).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('E-mail'), 'ana@teste.com')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    expect(submit).toBeEnabled()
    expect(screen.getByRole('link', { name: /termos de uso/i })).toHaveAttribute('href', '/termos')
    expect(screen.getByRole('link', { name: /política de privacidade/i })).toHaveAttribute(
      'href',
      '/privacidade'
    )

    await user.click(submit)
    expect(register).toHaveBeenCalledWith('Ana', 'ana@teste.com', 'senha-forte-123', true)
  })
})

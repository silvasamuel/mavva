import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData } from '@/types/api'
import { SeasonNoticeModal } from './SeasonNoticeModal'
import { seasonDashboard } from './seasonFixture'

const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
}))

function renderModal(data: DashboardData) {
  const client = new QueryClient()
  client.setQueryData(['dashboard'], data)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<SeasonNoticeModal data={data} />} />
          <Route path="/quiz/new" element={<p>novo quiz</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return client
}

describe('SeasonNoticeModal', () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue(undefined)
  })

  it('stays closed when no notice is due', () => {
    renderModal(seasonDashboard())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('welcomes a new season with last month’s elo and the rules', async () => {
    const user = userEvent.setup()
    const client = renderModal(seasonDashboard({ notice: 'start' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova temporada' })

    expect(within(dialog).getByText('Começou a temporada de novembro de 2026!')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Você terminou o mês passado como Oliveira.')
    expect(dialog).toHaveTextContent('Seu maior elo é Cedro.')
    expect(dialog).toHaveTextContent(/XP, nível e o ranking de XP recomeçam/)

    await user.click(within(dialog).getByRole('button', { name: 'Bora começar' }))

    expect(post).toHaveBeenCalledWith('/users/me/season-notice', { notice: 'start' })
    expect(client.getQueryData<DashboardData>(['dashboard'])?.season_notice).toBeNull()
  })

  it('explains seasons to who has no last season yet', () => {
    renderModal(seasonDashboard({ notice: 'start', last: null }))
    expect(screen.getByRole('dialog')).toHaveTextContent('No Mavva, cada mês é uma temporada.')
  })

  it('warns in the last week and can jump straight into a quiz', async () => {
    const user = userEvent.setup()
    renderModal(seasonDashboard({ notice: 'end', daysLeft: 5 }))
    const dialog = screen.getByRole('dialog', { name: 'Fim da temporada' })

    expect(
      within(dialog).getByText('A temporada de novembro de 2026 termina em 5 dias')
    ).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Faltam 4 níveis para Videira')
    expect(dialog).toHaveTextContent(/Espiga vira o seu elo do mês passado/)

    await user.click(within(dialog).getByRole('button', { name: 'Jogar agora' }))

    expect(post).toHaveBeenCalledWith('/users/me/season-notice', { notice: 'end' })
    expect(await screen.findByText('novo quiz')).toBeInTheDocument()
  })

  it('says "termina hoje" on the last day', () => {
    renderModal(seasonDashboard({ notice: 'end', daysLeft: 1 }))
    expect(screen.getByText('A temporada de novembro de 2026 termina hoje')).toBeInTheDocument()
  })
})

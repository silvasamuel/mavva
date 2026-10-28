import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SeasonCard } from './SeasonCard'
import { seasonDashboard } from './seasonFixture'

function renderCard(data = seasonDashboard()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<SeasonCard data={data} />} />
        <Route path="/ranking" element={<p>ranking</p>} />
        <Route path="/quiz/new" element={<p>novo quiz</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SeasonCard', () => {
  it('shows the season, days left, month progress and the three elos', () => {
    renderCard()
    const card = screen.getByRole('region', { name: 'Temporada' })
    const view = within(card)

    expect(view.getByText('Temporada 2')).toBeInTheDocument()
    expect(view.getByText('Temporada de novembro de 2026')).toBeInTheDocument()
    expect(view.getByText('20 dias restantes')).toBeInTheDocument()
    expect(view.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
    expect(view.getByText('Elo atual').parentElement).toHaveTextContent('Espiga')
    expect(view.getByText('Maior elo').parentElement).toHaveTextContent('Cedro')
    expect(view.getByText('Mês passado').parentElement).toHaveTextContent('Oliveira')
    const prize = within(card).getByRole('region', { name: 'Troféu de novembro: tribo de José' })
    expect(prize).toHaveTextContent('Troféu de novembroTribo de José')
    expect(prize).toHaveTextContent('Curiosidade: Vendido pelos irmãos, governou o Egito')
  })

  it('reads "Sem elo" without a last season and links to the ranking', async () => {
    const user = userEvent.setup()
    renderCard(seasonDashboard({ last: null }))
    expect(screen.getByText('Mês passado').parentElement).toHaveTextContent('Sem elo')

    await user.click(screen.getByRole('button', { name: 'Ver ranking da temporada' }))
    expect(screen.getByText('ranking')).toBeInTheDocument()
  })

  it('turns into the final stretch in the last week', async () => {
    const user = userEvent.setup()
    renderCard(seasonDashboard({ daysLeft: 1 }))
    const card = screen.getByRole('region', { name: 'Temporada' })

    expect(within(card).getByText('Reta final da temporada')).toBeInTheDocument()
    expect(within(card).getByText('Último dia')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Subir de elo agora' }))
    expect(screen.getByText('novo quiz')).toBeInTheDocument()
  })
})

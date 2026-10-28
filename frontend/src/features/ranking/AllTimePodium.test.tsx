import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AllTimePodium as Data, PublicUser } from '@/types/api'
import { AllTimePodium } from './AllTimePodium'

function user(username: string): PublicUser {
  return {
    id: `u-${username}`,
    username,
    name: username,
    level: 12,
    rank: { code: 'espiga', name: 'Espiga' },
    duel_wins: 0,
    duel_losses: 0,
    duel_draws: 0,
  }
}

const data: Data = {
  podium: [
    { position: 1, score: 4200, season: { number: 2, name: 'setembro de 2026' }, live: false, is_me: false, user: user('bia') },
    { position: 2, score: 3900, season: { number: 3, name: 'outubro de 2026' }, live: true, is_me: true, user: user('samuel') },
    { position: 3, score: 3100, season: { number: 1, name: 'agosto de 2026' }, live: false, is_me: false, user: user('ana') },
  ],
}

describe('AllTimePodium', () => {
  it('reads first, second and third, with score and season', () => {
    render(<AllTimePodium data={data} onOpen={vi.fn()} />)
    const podium = screen.getByRole('region', { name: 'Pódio de todos os tempos' })
    const places = within(podium).getAllByRole('listitem')
    expect(places[0]).toHaveTextContent('@bia')
    expect(places[0]).toHaveTextContent('4.200 XP')
    expect(places[0]).toHaveTextContent('setembro de 2026')
    expect(places[0]).toHaveTextContent('1º')
    expect(places[1]).toHaveTextContent('Você')
    expect(places[1]).toHaveTextContent('outubro de 2026 · ao vivo')
    expect(places[2]).toHaveTextContent('@ana')
    expect(places[2]).toHaveTextContent('3º')
  })

  it('opens the player tapped on the podium', async () => {
    const onOpen = vi.fn()
    render(<AllTimePodium data={data} onOpen={onOpen} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /@bia/ }))
    expect(onOpen).toHaveBeenCalledWith(data.podium[0].user)
  })

  it('renders nothing before anyone scores', () => {
    const { container } = render(<AllTimePodium data={{ podium: [] }} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContributorSeal, PlayerSeals, SealShelf, SupporterSeal, WisdomSeal } from './PlayerSeals'

describe('WisdomSeal', () => {
  it('names the level out of ten', () => {
    render(<WisdomSeal level={4} />)
    expect(screen.getByRole('img', { name: 'Sabedoria 4 de 10' })).toHaveTextContent('4')
  })

  it('keeps odd values inside 1 to 10', () => {
    render(
      <>
        <WisdomSeal level={0} />
        <WisdomSeal level={37} />
      </>
    )
    expect(screen.getByRole('img', { name: 'Sabedoria 1 de 10' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sabedoria 10 de 10' })).toBeInTheDocument()
  })
})

describe('ContributorSeal and SupporterSeal', () => {
  it('name the tier in Portuguese', () => {
    render(
      <>
        <ContributorSeal tier="bronze" />
        <ContributorSeal tier="silver" />
        <ContributorSeal tier="gold" />
        <ContributorSeal tier="diamond" />
      </>
    )
    for (const tier of ['Bronze', 'Prata', 'Ouro', 'Diamante']) {
      expect(screen.getByRole('img', { name: `Contribuidor ${tier}` })).toBeInTheDocument()
    }
  })

  it('draw an empty slot for a seal not earned yet', () => {
    render(
      <>
        <ContributorSeal tier={null} />
        <SupporterSeal active={false} />
      </>
    )
    expect(screen.getByRole('img', { name: 'Contribuidor: ainda sem selo' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Apoiador: selo inativo' })).toBeInTheDocument()
  })
})

describe('PlayerSeals', () => {
  it('shows the three seals side by side when the player has them all', () => {
    render(<PlayerSeals of={{ wisdom_level: 7, contributor_tier: 'gold', is_supporter: true }} />)
    expect(screen.getAllByRole('img').map((seal) => seal.getAttribute('aria-label'))).toEqual([
      'Sabedoria 7 de 10',
      'Contribuidor Ouro',
      'Mavva Apoiador',
    ])
  })

  it('shows only wisdom for a player with nothing else, starting at 1', () => {
    render(<PlayerSeals of={{}} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Sabedoria 1 de 10' })).toBeInTheDocument()
  })
})

describe('SealShelf', () => {
  it('spells each seal out in words', () => {
    render(
      <SealShelf
        of={{ wisdom_level: 6, contributor_tier: 'silver', is_supporter: true }}
        contributions={7}
      />
    )
    const shelf = screen.getByLabelText('Selos')
    expect(within(shelf).getByText('Sabedoria')).toBeInTheDocument()
    expect(within(shelf).getByText('Nível 6')).toBeInTheDocument()
    expect(within(shelf).getByText('Prata')).toBeInTheDocument()
    expect(within(shelf).getByText('7 aceitas')).toBeInTheDocument()
    expect(within(shelf).getByText('Ativo')).toBeInTheDocument()
  })

  it('leaves out the seals the player has not earned', () => {
    render(<SealShelf of={{ wisdom_level: 2 }} contributions={0} />)
    const shelf = screen.getByLabelText('Selos')
    expect(within(shelf).queryByText('Contribuidor')).not.toBeInTheDocument()
    expect(within(shelf).queryByText('Apoiador')).not.toBeInTheDocument()
  })
})

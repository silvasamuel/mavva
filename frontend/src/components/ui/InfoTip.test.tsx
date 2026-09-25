import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { InfoTip } from './InfoTip'

function setup() {
  const user = userEvent.setup()
  render(
    <div>
      <InfoTip label="O que é espaçamento?">Cada acerto aumenta o intervalo.</InfoTip>
      <button type="button">outro</button>
    </div>
  )
  return { user, trigger: screen.getByRole('button', { name: 'O que é espaçamento?' }) }
}

describe('InfoTip', () => {
  it('starts closed', () => {
    setup()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens with Enter, links the description, and closes with Escape', async () => {
    const { user, trigger } = setup()
    trigger.focus()
    await user.keyboard('{Enter}')

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Cada acerto aumenta o intervalo.')
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('toggles on tap for touch screens', async () => {
    const { user, trigger } = setup()
    await user.pointer({ keys: '[TouchA]', target: trigger })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    await user.pointer({ keys: '[TouchA]', target: trigger })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows on hover and a click does not snap it shut', async () => {
    const { user, trigger } = setup()
    await user.hover(trigger)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    await user.unhover(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes when tapping anywhere else', async () => {
    const { user, trigger } = setup()
    await user.pointer({ keys: '[TouchA]', target: trigger })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    await user.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'outro' }) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders the bubble outside its container so a card cannot clip it', async () => {
    const { user, trigger } = setup()
    trigger.focus()
    await user.keyboard('{Enter}')
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.parentElement).toBe(document.body)
  })
})

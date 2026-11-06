import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameHud } from './GameHud'

describe('GameHud', () => {
  it('opens the player’s own profile from the badge', async () => {
    const user = userEvent.setup()
    const onOpenProfile = vi.fn()
    render(<GameHud rankCode="broto" rankName="Broto" level={6} onOpenProfile={onOpenProfile} />)

    await user.click(screen.getByRole('button', { name: 'Ver meu perfil' }))
    expect(onOpenProfile).toHaveBeenCalledTimes(1)
  })

  it('keeps the badge plain where there is no profile to open', () => {
    render(<GameHud rankCode="broto" rankName="Broto" level={6} />)
    expect(screen.queryByRole('button', { name: 'Ver meu perfil' })).not.toBeInTheDocument()
  })
})

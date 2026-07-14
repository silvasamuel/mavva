import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Estudar agora</Button>)
    expect(screen.getByRole('button', { name: /estudar agora/i })).toBeInTheDocument()
  })

  it('is disabled and shows a spinner while loading', () => {
    render(<Button loading>Salvar</Button>)
    const button = screen.getByRole('button', { name: /salvar/i })
    expect(button).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

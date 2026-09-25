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

  it('swaps the padding for the small size instead of stacking both', () => {
    // px-3 next to px-5 would lose: Tailwind emits px-3 first.
    render(<Button size="sm">Aceitar</Button>)
    const button = screen.getByRole('button', { name: /aceitar/i })
    expect(button).toHaveClass('px-3', 'py-2', 'text-xs')
    expect(button).not.toHaveClass('px-5', 'py-3', 'text-sm')
  })
})

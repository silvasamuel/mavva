import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('keeps the height the caller asked for', () => {
    // With h-4 also on the element, Tailwind's order made h-4 win over h-2.
    render(<ProgressBar value={3} max={10} className="mt-1.5 h-2" />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveClass('h-2')
    expect(bar).not.toHaveClass('h-4')
  })

  it('falls back to h-4 without a height', () => {
    render(<ProgressBar value={3} max={10} className="flex-1" />)
    expect(screen.getByRole('progressbar')).toHaveClass('h-4', 'flex-1')
  })
})

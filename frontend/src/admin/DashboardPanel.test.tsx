import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdminDashboard } from './types'
import { DashboardPanel } from './DashboardPanel'

const dashboard: AdminDashboard = {
  users: { total: 40, active: 38, unverified: 3, new_7d: 5 },
  questions: {
    total: 900,
    active: 880,
    inactive: 20,
    open_answer: 90,
    old_testament: 500,
    easy: 300,
    medium: 300,
    hard: 200,
    expert: 100,
  },
  review: { flags_open: 1, proposals_pending: 2, suggestions_open: 0, pending: 3 },
  activity: {
    studied_today: 7,
    xp_today: 640,
    questions_answered: 12000,
    accuracy: 0.81,
    total_xp: 150000,
    longest_streak: 45,
    max_level: 18,
    duels_open: 1,
    duels_active: 2,
    duels_finished: 30,
  },
}

describe('DashboardPanel', () => {
  it('opens the activity panel from “Estudaram hoje”', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<DashboardPanel data={dashboard} onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /Estudaram hoje/ }))

    expect(onNavigate).toHaveBeenCalledWith('activity')
  })

  it('keeps the lifetime numbers under “Totais gerais”', () => {
    render(<DashboardPanel data={dashboard} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Totais gerais' })).toBeInTheDocument()
    expect(screen.getByText('XP acumulado').parentElement).toHaveTextContent('150.000')
    expect(screen.queryByText('Amizades')).not.toBeInTheDocument()
  })
})

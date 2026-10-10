import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { QuizComplete } from '@/types/api'
import { QuizSummaryPage } from './QuizSummaryPage'

vi.mock('@/lib/sfx', () => ({
  playFanfare: vi.fn(),
  playRankUp: vi.fn(),
}))

function summary(overrides: Partial<QuizComplete> = {}): QuizComplete {
  return {
    correct_count: 8,
    question_count: 10,
    answered_count: 10,
    accuracy: 0.8,
    xp_earned: 160,
    bonus_xp: 5,
    duration_seconds: 240,
    level: { current: 3, leveled_up: false, xp_into_level: 40, xp_for_next: 200 },
    rank: { code: 'semente', name: 'Semente', rank_up: false },
    streak: { current: 0, extended_today: false },
    daily_goal: { target: 50, earned_today: 160, achieved: true },
    best_combo: 5,
    unlocked_achievements: [],
    ...overrides,
  }
}

function renderSummary(state: QuizComplete) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/quiz/session-1/summary', state }]}>
      <Routes>
        <Route path="/quiz/:sessionId/summary" element={<QuizSummaryPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('QuizSummaryPage best combo', () => {
  it('shows the longest run of hits', () => {
    renderSummary(summary())
    expect(screen.getByText('8/10 acertos')).toBeInTheDocument()
    expect(screen.getByText('Maior combo: 5')).toBeInTheDocument()
  })

  it('stays quiet when there was no run of two', () => {
    renderSummary(summary({ best_combo: 1 }))
    expect(screen.queryByText(/maior combo/i)).not.toBeInTheDocument()
  })
})

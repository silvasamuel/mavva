import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('QuizSummaryPage wisdom', () => {
  // The last beat is the final screen; a plain summary has hero, xp, goal, done.
  async function goToFinalScreen() {
    const user = userEvent.setup()
    const page = document.body.firstElementChild!.firstElementChild!
    for (let tap = 0; tap < 8 && !screen.queryByText('Celeiro guardado'); tap++) {
      await user.click(page)
    }
    await screen.findByText('Celeiro guardado')
  }

  it('shows how much wisdom the quiz added', async () => {
    renderSummary(summary({ wisdom: { delta: 7, level: 3, previous_level: 3 } }))
    await goToFinalScreen()
    expect(screen.getByText('Sabedoria +7')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sabedoria 3 de 10' })).toBeInTheDocument()
  })

  it('shows a drop, and the new level when the quiz crossed one', async () => {
    renderSummary(summary({ wisdom: { delta: -4, level: 2, previous_level: 3 } }))
    await goToFinalScreen()
    expect(screen.getByText('Sabedoria −4 · caiu para o nível 2')).toBeInTheDocument()
  })

  it('celebrates a level gained', async () => {
    renderSummary(summary({ wisdom: { delta: 12, level: 4, previous_level: 3 } }))
    await goToFinalScreen()
    expect(screen.getByText('Sabedoria +12 · subiu para o nível 4')).toBeInTheDocument()
  })

  it('says nothing when wisdom did not move', async () => {
    renderSummary(summary({ wisdom: { delta: 0, level: 3, previous_level: 3 } }))
    await goToFinalScreen()
    expect(screen.queryByText(/Sabedoria/)).not.toBeInTheDocument()
  })
})

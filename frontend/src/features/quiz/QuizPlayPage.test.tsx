import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback, QuizSession } from '@/types/api'
import { QuizPlayPage } from './QuizPlayPage'

vi.mock('@/lib/sfx', () => ({
  playCorrect: vi.fn(),
  playWrong: vi.fn(),
}))

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

function session(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    id: 'session-1',
    mode: 'practice',
    question_count: 2,
    correct_count: 0,
    answered_count: 0,
    completed: false,
    timer_seconds: 20,
    duel_id: 'duel-1',
    filters: { timer_seconds: 20 },
    questions: [
      {
        id: 'q1',
        position: 0,
        type: 'multiple_choice',
        text: 'Quem construiu a arca?',
        difficulty: 'easy',
        category_name: 'Personagens',
        category_icon: '👤',
        options: [
          { id: 'q1-a', text: 'Noé' },
          { id: 'q1-b', text: 'Moisés' },
        ],
        answered: false,
        timer_remaining: 20,
      },
      {
        id: 'q2',
        position: 1,
        type: 'multiple_choice',
        text: 'Quem foi engolido pelo grande peixe?',
        difficulty: 'easy',
        category_name: 'Personagens',
        category_icon: '👤',
        options: [
          { id: 'q2-a', text: 'Jonas' },
          { id: 'q2-b', text: 'Elias' },
        ],
        answered: false,
        timer_remaining: 20,
      },
    ],
    ...overrides,
  }
}

function feedback(overrides: Partial<AnswerFeedback> = {}): AnswerFeedback {
  return {
    is_correct: true,
    correct_option_id: 'q1-a',
    correct_answer: null,
    explanation: 'Gênesis narra que Noé construiu a arca.',
    divergence_note: null,
    reference: {
      book: 'genesis',
      book_name: 'Gênesis',
      chapter: 6,
      verse_start: 14,
      verse_end: null,
      display: 'Gênesis 6:14',
    },
    xp_earned: 0,
    ...overrides,
  }
}

function renderPlay() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/quiz/session-1']}>
        <Routes>
          <Route path="/quiz/:sessionId" element={<QuizPlayPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('QuizPlayPage report during a round', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    get.mockImplementation((path: string) => {
      if (path.startsWith('/quizzes/')) return Promise.resolve(session())
      return Promise.resolve(null)
    })
    post.mockImplementation((path: string) => {
      if (path.endsWith('/present')) return Promise.resolve({ timer_remaining: 20 })
      if (path.endsWith('/answers')) return Promise.resolve(feedback())
      if (path === '/flags') return Promise.resolve({ id: 'flag-1', status: 'open' })
      return Promise.resolve({})
    })
  })

  it('lets the player answer the next question after reporting the current one', async () => {
    const user = userEvent.setup()
    renderPlay()

    expect(await screen.findByText('Quem construiu a arca?')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /noé/i }))
    await user.click(screen.getByRole('button', { name: /responder/i }))

    expect(await screen.findByText('Correto!')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /há um problema nesta pergunta/i }))
    await user.click(screen.getByRole('button', { name: /^enviar$/i }))
    expect(await screen.findByText('Obrigado, vamos revisar.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /fechar/i }))
    await user.click(screen.getByRole('button', { name: /continuar/i }))

    expect(await screen.findByText('Quem foi engolido pelo grande peixe?')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /jonas/i }))
    await user.click(screen.getByRole('button', { name: /responder/i }))

    await waitFor(() => {
      const answers = post.mock.calls.filter(([path]) => String(path).endsWith('/answers'))
      expect(answers).toHaveLength(2)
      expect(answers[1][1]).toMatchObject({
        question_id: 'q2',
        selected_option_id: 'q2-a',
      })
      expect(answers[1][1].timed_out).toBeUndefined()
    })
    expect(post.mock.calls.some(([path]) => path === '/flags')).toBe(true)
    const quizReads = get.mock.calls.filter(([path]) => String(path).startsWith('/quizzes/'))
    expect(quizReads).toHaveLength(1)
  })
})

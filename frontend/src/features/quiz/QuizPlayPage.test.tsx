import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback, QuizQuestion, QuizSession } from '@/types/api'
import { playCombo } from '@/lib/sfx'
import { QuizPlayPage } from './QuizPlayPage'

vi.mock('@/lib/sfx', () => ({
  playCombo: vi.fn(),
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
    combo: 0,
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
    combo: 1,
    combo_bonus_xp: 0,
    ...overrides,
  }
}

/** Untimed practice question n: option "Certa n" is right, "Errada n" is wrong. */
function plainQuestion(n: number): QuizQuestion {
  return {
    id: `q${n}`,
    position: n - 1,
    type: 'multiple_choice',
    text: `Pergunta número ${n}?`,
    difficulty: 'easy',
    category_name: 'Personagens',
    category_icon: '👤',
    options: [
      { id: `q${n}-a`, text: `Certa ${n}` },
      { id: `q${n}-b`, text: `Errada ${n}` },
    ],
    answered: false,
    timer_remaining: null,
  }
}

function practiceSession(questionCount: number, overrides: Partial<QuizSession> = {}) {
  return session({
    question_count: questionCount,
    timer_seconds: null,
    duel_id: null,
    filters: {},
    questions: Array.from({ length: questionCount }, (_, i) => plainQuestion(i + 1)),
    ...overrides,
  })
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

describe('QuizPlayPage combo', () => {
  let answerQueue: AnswerFeedback[] = []

  function play(quiz: QuizSession, answers: AnswerFeedback[]) {
    answerQueue = [...answers]
    get.mockImplementation((path: string) => {
      if (path.startsWith('/quizzes/')) return Promise.resolve(quiz)
      return Promise.resolve(null)
    })
    renderPlay()
  }

  async function answer(user: ReturnType<typeof userEvent.setup>, n: number, correct = true) {
    expect(await screen.findByText(`Pergunta número ${n}?`)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: correct ? `Certa ${n}` : `Errada ${n}` }))
    await user.click(screen.getByRole('button', { name: /responder/i }))
    await screen.findByRole('dialog', { name: correct ? 'Resposta correta' : 'Resposta incorreta' })
  }

  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    vi.mocked(playCombo).mockReset()
    post.mockImplementation((path: string) => {
      if (path.endsWith('/answers')) return Promise.resolve(answerQueue.shift())
      return Promise.resolve({})
    })
  })

  it('shows the badge from x2 and drops it after a wrong answer', async () => {
    const user = userEvent.setup()
    play(practiceSession(4), [
      feedback({ correct_option_id: 'q1-a', combo: 1 }),
      feedback({ correct_option_id: 'q2-a', combo: 2 }),
      feedback({ is_correct: false, correct_option_id: 'q3-a', combo: 0 }),
    ])

    await answer(user, 1)
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    expect(screen.queryByText('x1')).not.toBeInTheDocument()

    await answer(user, 2)
    // Combo 2 shows on the badge, but the splash only calls it out from 3.
    expect(screen.queryByText(/combo x/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText('x2')).toBeInTheDocument()
    expect(screen.getByText('Combo de 2 acertos seguidos')).toBeInTheDocument()

    await answer(user, 3, false)
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText('Pergunta número 4?')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('x2')).not.toBeInTheDocument())
    expect(playCombo).not.toHaveBeenCalled()
  })

  it('calls out the combo and its bonus XP on the splash', async () => {
    const user = userEvent.setup()
    play(practiceSession(2, { combo: 3 }), [
      feedback({ correct_option_id: 'q1-a', combo: 4, combo_bonus_xp: 2, xp_earned: 12 }),
    ])

    // Resuming mid-run: the badge starts from the server's combo.
    expect(await screen.findByText('x3')).toBeInTheDocument()
    await answer(user, 1)
    expect(screen.getByText('Combo x4')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    expect(screen.getByText('+2 XP de combo')).toBeInTheDocument()
    expect(playCombo).toHaveBeenCalledWith(4)

    await user.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText('x4')).toBeInTheDocument()
  })
})

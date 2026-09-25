import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminActivity } from './types'
import { ActivityPanel } from './ActivityPanel'

const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiError: class ApiError extends Error {},
}))

// Recharts needs real layout, which jsdom doesn't do; the labels it uses are
// covered in activity.test.ts.
vi.mock('./ActivityChart', () => ({
  ActivityChart: ({ metric, series }: { metric: string; series: unknown[] }) => (
    <div data-testid="chart">{`${metric}:${series.length}`}</div>
  ),
}))

vi.mock('./UserDetail', () => ({
  UserDetail: ({ userId }: { userId: string }) => (
    <div role="dialog" aria-label="Detalhe do usuário">
      {userId}
    </div>
  ),
}))

function activity(overrides: Partial<AdminActivity> = {}): AdminActivity {
  return {
    range: { start: '2026-08-27', end: '2026-09-25', first_day: '2026-08-27', granularity: 'day' },
    totals: {
      active_users: 30,
      new_users: 12,
      questions_answered: 1500,
      correct_answers: 1200,
      accuracy: 0.8,
      xp: 25000,
      study_seconds: 18000,
      quizzes_completed: 140,
      practice_completed: 100,
      review_completed: 30,
      duel_rounds_completed: 10,
      quizzes_abandoned: 7,
      perfect_sessions: 25,
      duels_started: 9,
      duels_finished: 6,
      friendships: 4,
      achievements_unlocked: 17,
      reports: 2,
      question_proposals: 3,
      suggestions: 1,
    },
    previous: {
      start: '2026-07-28',
      end: '2026-08-26',
      active_users: 20,
      new_users: 16,
      questions_answered: 1500,
      xp: 20000,
      study_seconds: 0,
    },
    series: [
      {
        bucket: '2026-08-27',
        active_users: 3,
        new_users: 1,
        questions_answered: 40,
        xp: 500,
        study_seconds: 600,
      },
    ],
    top_categories: [
      { slug: 'profetas', name: 'Profetas', icon: '📣', answered: 300, accuracy: 0.9 },
    ],
    top_players: [
      { id: 'u-ana', username: 'ana', name: 'Ana Souza', xp: 4200, questions_answered: 310 },
    ],
    ...overrides,
  }
}

const sinceTheBeginning = activity({
  range: { start: null, end: '2026-09-25', first_day: '2026-03-12', granularity: 'week' },
  previous: null,
})

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ActivityPanel adminId="u-admin" />
    </QueryClientProvider>
  )
}

describe('ActivityPanel', () => {
  beforeEach(() => {
    // Midday in Brasília on 2026-09-25; only Date is faked so user-event keeps working.
    vi.useFakeTimers({ now: new Date('2026-09-25T15:00:00Z'), toFake: ['Date'] })
    get
      .mockReset()
      .mockImplementation(async (path: string) =>
        path === '/admin/activity' ? sinceTheBeginning : activity()
      )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on the last 30 days, compared with the 30 days before', async () => {
    renderPanel()

    const active = await screen.findByRole('group', { name: 'Jogadores ativos' })
    expect(get).toHaveBeenCalledWith('/admin/activity?start=2026-08-27')
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('De 27/08/2026 a 25/09/2026')).toBeInTheDocument()

    expect(within(active).getByText('30')).toBeInTheDocument()
    expect(within(active).getByText('+50%')).toBeInTheDocument()
    const signups = screen.getByRole('group', { name: 'Novos usuários' })
    expect(within(signups).getByText('−25%')).toBeInTheDocument()
    const answers = screen.getByRole('group', { name: 'Perguntas respondidas' })
    expect(within(answers).getByText('1.500')).toBeInTheDocument()
    expect(within(answers).getByText('0%')).toBeInTheDocument()
    expect(within(answers).getByText('80% de acerto')).toBeInTheDocument()
    // No study time before: nothing to compare with.
    const time = screen.getByRole('group', { name: 'Tempo de estudo' })
    expect(within(time).getByText('5h 00min')).toBeInTheDocument()
    expect(within(time).queryByText(/%/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Variação em relação aos 30 dias anteriores (28/07/2026 a 26/08/2026).')
    ).toBeInTheDocument()

    expect(screen.getByText('Treinos concluídos').parentElement).toHaveTextContent('100')
    expect(screen.getByText('Amizades feitas').parentElement).toHaveTextContent('4')
    expect(screen.getByText('Denúncias de perguntas').parentElement).toHaveTextContent('2')
  })

  it('shows everything since the first day with data, without comparing', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('group', { name: 'Jogadores ativos' })

    await user.click(screen.getByRole('button', { name: 'Desde o início' }))

    expect(
      await screen.findByText('Desde 12/03/2026, o primeiro dia com dados, até 25/09/2026')
    ).toBeInTheDocument()
    expect(get).toHaveBeenLastCalledWith('/admin/activity')
    expect(screen.getByRole('button', { name: 'Desde o início' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.queryByText('+50%')).not.toBeInTheDocument()
    expect(screen.queryByText(/Variação em relação/)).not.toBeInTheDocument()
    expect(screen.getByText('Evolução por semana')).toBeInTheDocument()
    expect(screen.getByText(/Cada barra conta jogadores diferentes na semana/)).toBeInTheDocument()
  })

  it('applies a custom range only once it makes sense', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('group', { name: 'Jogadores ativos' })

    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    const from = screen.getByLabelText('De')
    const to = screen.getByLabelText('Até')
    expect(from).toHaveValue('2026-08-27')
    expect(to).toHaveValue('2026-09-25')

    fireEvent.change(from, { target: { value: '2026-09-20' } })
    fireEvent.change(to, { target: { value: '2026-09-10' } })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A data inicial precisa ser anterior à final.'
    )
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()

    fireEvent.change(to, { target: { value: '2026-09-24' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(get).toHaveBeenLastCalledWith('/admin/activity?start=2026-09-20&end=2026-09-24')
    expect(screen.getByRole('button', { name: 'Personalizado' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.queryByLabelText('De')).not.toBeInTheDocument()
  })

  it('refuses an end date in the future', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('group', { name: 'Jogadores ativos' })

    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-26' } })

    expect(screen.getByRole('alert')).toHaveTextContent('A data final não pode estar no futuro.')
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  })

  it('charts the metric the admin picks', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(await screen.findByTestId('chart')).toHaveTextContent('active_users:1')

    await user.click(screen.getByRole('button', { name: 'XP' }))

    expect(screen.getByTestId('chart')).toHaveTextContent('xp:1')
    expect(screen.getByRole('button', { name: 'XP' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lists the most played categories and opens a top player', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(await screen.findByText('Profetas')).toBeInTheDocument()
    expect(screen.getByText('300 respostas · 90% de acerto')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Ana Souza/ }))

    expect(screen.getByRole('dialog', { name: 'Detalhe do usuário' })).toHaveTextContent('u-ana')
  })

  it('says so when nothing happened in the period', async () => {
    get.mockResolvedValue(activity({ top_categories: [], top_players: [] }))
    renderPanel()

    expect(await screen.findByText('Nenhuma resposta no período.')).toBeInTheDocument()
    expect(screen.getByText('Ninguém ganhou XP no período.')).toBeInTheDocument()
  })

  it('skips the comparison when the window before has no data', async () => {
    const empty = { active_users: 0, new_users: 0, questions_answered: 0, xp: 0, study_seconds: 0 }
    get.mockResolvedValue(
      activity({ previous: { start: '2025-09-26', end: '2026-08-26', ...empty } })
    )
    renderPanel()
    await screen.findByRole('group', { name: 'Jogadores ativos' })

    expect(screen.queryAllByText(/^(?:[+−]\d+|0)%$/)).toHaveLength(0)
    expect(screen.queryByText(/Variação em relação/)).not.toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    const user = userEvent.setup()
    get.mockRejectedValueOnce(new Error('Falha de rede'))
    renderPanel()

    expect(await screen.findByText('Falha de rede')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('group', { name: 'Jogadores ativos' })).toBeInTheDocument()
  })
})

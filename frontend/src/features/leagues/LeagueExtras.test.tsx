import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeagueDetail, LeagueInvitePreview } from '@/types/api'
import { LeagueCreatePage } from './LeagueCreatePage'
import { LeagueGames } from './LeagueGames'
import { LeagueJoinPage } from './LeagueJoinPage'
import { LeagueLayout } from './LeagueLayout'
import { LeagueOverview } from './LeagueOverview'
import { LeaguePlayers } from './LeaguePlayers'
import { PendingLeagueInvite } from './PendingLeagueInvite'
import { cupMatch, detail, side } from './leagueFixture'

const get = vi.fn()
const post = vi.fn()
let signedIn = true

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      get: (...args: unknown[]) => get(...args),
      post: (...args: unknown[]) => post(...args),
      delete: vi.fn(),
    },
  }
})

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: signedIn ? { id: 'id-samuel', is_supporter: true } : null,
    loading: false,
  }),
}))

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<PendingLeagueInvite />} />
          <Route path="/leagues/new" element={<LeagueCreatePage />} />
          <Route path="/leagues/join/:code" element={<LeagueJoinPage />} />
          <Route path="/leagues/:leagueId" element={<LeagueLayout />}>
            <Route index element={<LeagueOverview />} />
            <Route path="games" element={<LeagueGames />} />
            <Route path="players" element={<LeaguePlayers />} />
          </Route>
          <Route path="/register" element={<p>tela de cadastro</p>} />
          <Route path="/login" element={<p>tela de login</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function serve(data: LeagueDetail) {
  get.mockImplementation((path: string) =>
    path === '/friends'
      ? Promise.resolve({ friends: [], incoming: [], sent: [], limit: 70 })
      : Promise.resolve(data)
  )
}

function preview(overrides: Partial<LeagueInvitePreview> = {}): LeagueInvitePreview {
  return {
    name: 'Liga da Célula',
    format: 'cup',
    status: 'recruiting',
    rounds: null,
    ends_on: '2026-12-20',
    admin_name: 'Samuel Silva',
    admin_username: 'samuel',
    member_count: 3,
    max_members: 20,
    question_count: 12,
    timer_seconds: 30,
    open: true,
    ...overrides,
  }
}

beforeEach(() => {
  signedIn = true
  localStorage.clear()
  get.mockReset()
  post.mockReset()
})

describe('rules chosen by the admin', () => {
  const categories = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    slug: `tema${index}`,
    name: `Tema ${index + 1}`,
    description: '',
    icon: '📖',
    question_count: 30,
    answered: 0,
    accuracy: null,
  }))

  it('sends the questions per fixture and the time per question', async () => {
    const user = userEvent.setup()
    const created = detail({ id: 'nova', status: 'recruiting' })
    get.mockImplementation((path: string) =>
      path === '/categories'
        ? Promise.resolve(categories)
        : path === '/friends'
          ? Promise.resolve({ friends: [], incoming: [], sent: [], limit: 70 })
          : Promise.resolve(created)
    )
    post.mockResolvedValue(created)
    renderAt('/leagues/new')

    await user.type(screen.getByLabelText('Nome da liga'), 'Liga')
    await user.click(await screen.findByRole('button', { name: 'Selecionar todos' }))
    const questions = screen.getByLabelText('Perguntas por partida')
    await user.clear(questions)
    await user.type(questions, '4')
    expect(screen.getByText('De 5 a 20 perguntas')).toBeInTheDocument()
    expect(screen.getByText(/de 5 a 20 perguntas por partida/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar liga e convidar jogadores' })).toBeDisabled()

    await user.clear(questions)
    await user.type(questions, '15')
    await user.click(screen.getByRole('radio', { name: '45 s' }))
    await user.click(screen.getByRole('button', { name: 'Criar liga e convidar jogadores' }))

    expect(post).toHaveBeenCalledWith(
      '/leagues',
      expect.objectContaining({ question_count: 15, timer_seconds: 45 })
    )
  })

  it('explains the 24 hour rule when the format is a cup', async () => {
    const user = userEvent.setup()
    get.mockResolvedValue(categories)
    renderAt('/leagues/new')
    expect(screen.queryByText(/cada duelo tem 24 horas/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Copa/ }))
    expect(screen.getByText(/cada duelo tem 24 horas/)).toBeInTheDocument()
  })
})

describe('cup deadlines on the bracket', () => {
  it('shows the deadline, the walkover and the match nobody played', async () => {
    serve(
      detail({
        format: 'cup',
        rounds: null,
        my_match_id: 'match-3',
        my_match_deadline_at: '2026-11-14T18:30:00Z',
        bracket: [
          {
            round: 1,
            label: 'Rodada 1',
            matches: [
              cupMatch(1, side('maria', { played: true }), side('joao'), {
                winner_id: 'id-maria',
                decided_by: 'walkover',
              }),
              cupMatch(2, side('rute'), side('davi'), { decided_by: 'void' }),
              cupMatch(3, side('samuel'), side('ana'), { deadline_at: '2026-11-14T18:30:00Z' }),
            ],
          },
          {
            round: 2,
            label: 'Final',
            matches: [cupMatch(4, side('maria'), side(null, { from_match: 2, vacant: true }))],
          },
        ],
      })
    )
    renderAt('/leagues/league-1/games')

    const walkover = (await screen.findByText('Jogo 1')).closest('li')!
    expect(within(walkover).getByText(/Vitória por W\.O\./)).toBeInTheDocument()
    const nobody = screen.getByText('Jogo 2').closest('li')!
    expect(within(nobody).getByText('Ninguém jogou no prazo: sem vencedor')).toBeInTheDocument()
    const mine = screen.getByText('Jogo 3').closest('li')!
    expect(within(mine).getByText(/^Prazo:/)).toBeInTheDocument()
    // Settled matches no longer show a clock.
    expect(within(walkover).queryByText(/^Prazo:/)).not.toBeInTheDocument()
    const final = screen.getByText('Jogo 4').closest('li')!
    expect(within(final).getByText('Sem adversário')).toBeInTheDocument()
  })

  it('tells me on the overview until when my duel can be played', async () => {
    serve(
      detail({
        format: 'cup',
        rounds: null,
        my_match_id: 'match-3',
        my_match_deadline_at: '2026-11-14T18:30:00Z',
      })
    )
    renderAt('/leagues/league-1')
    expect(await screen.findByText(/ou você perde por W\.O\./)).toBeInTheDocument()
  })
})

describe('invite link', () => {
  it('gives the admin a link to copy or send on WhatsApp', async () => {
    serve(detail({ status: 'recruiting', invite_code: 'abc123XYZ' }))
    renderAt('/leagues/league-1/players')

    const field = await screen.findByLabelText('Link de convite da liga')
    expect(field).toHaveValue(`${window.location.origin}/leagues/join/abc123XYZ`)
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument()
    const whatsapp = screen.getByRole('link', { name: 'Enviar no WhatsApp' })
    const href = decodeURIComponent(whatsapp.getAttribute('href') ?? '')
    expect(href).toContain('https://wa.me/?text=')
    expect(href).toContain('Liga da Célula')
    expect(href).toContain('/leagues/join/abc123XYZ')
  })

  it('has no link once the league has started', async () => {
    serve(detail({ status: 'active', invite_code: null }))
    renderAt('/leagues/league-1/players')
    await screen.findByText('Jogadores · 4')
    expect(screen.queryByLabelText('Link de convite da liga')).not.toBeInTheDocument()
  })

  it('takes a signed-in player straight to the invitation', async () => {
    get.mockImplementation((path: string) =>
      path === '/leagues/invite/abc'
        ? Promise.resolve(preview())
        : Promise.resolve(
            detail({ id: 'league-9', status: 'recruiting', my_status: 'invited', is_owner: false })
          )
    )
    post.mockResolvedValue({ league_id: 'league-9' })
    renderAt('/leagues/join/abc')

    await waitFor(() => expect(post).toHaveBeenCalledWith('/leagues/invite/abc/redeem'))
    expect(await screen.findByText(/convidou você para esta liga/)).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('shows the league to a visitor and keeps the invite for after sign-up', async () => {
    const user = userEvent.setup()
    signedIn = false
    get.mockResolvedValue(preview())
    renderAt('/leagues/join/abc')

    expect(await screen.findByText('Liga da Célula')).toBeInTheDocument()
    expect(screen.getByText(/Samuel Silva \(@samuel\) convidou você para/)).toBeInTheDocument()
    expect(screen.getByText(/12 perguntas por partida, 30 s cada/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    await waitFor(() => expect(localStorage.getItem('mavva:league-invite')).toBe('abc'))

    await user.click(screen.getByRole('button', { name: 'Criar conta e ver o convite' }))
    expect(screen.getByText('tela de cadastro')).toBeInTheDocument()
  })

  it('says so when the league has already started', async () => {
    signedIn = false
    get.mockResolvedValue(preview({ status: 'active', open: false }))
    renderAt('/leagues/join/abc')
    expect(await screen.findByText(/já começou: não dá mais para entrar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Criar conta/ })).not.toBeInTheDocument()
    expect(localStorage.getItem('mavva:league-invite')).toBeNull()
  })

  it('redeems an invite kept from before signing in, once', async () => {
    localStorage.setItem('mavva:league-invite', 'abc')
    serve(detail({ id: 'league-9', status: 'recruiting', my_status: 'invited', is_owner: false }))
    post.mockResolvedValue({ league_id: 'league-9' })
    renderAt('/')

    await waitFor(() => expect(post).toHaveBeenCalledWith('/leagues/invite/abc/redeem'))
    expect(await screen.findByText(/convidou você para esta liga/)).toBeInTheDocument()
    expect(localStorage.getItem('mavva:league-invite')).toBeNull()
  })
})

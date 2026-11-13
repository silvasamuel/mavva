import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeagueDetail } from '@/types/api'
import { LeagueCreatePage } from './LeagueCreatePage'
import { LeagueGames } from './LeagueGames'
import { LeagueLayout } from './LeagueLayout'
import { LeagueOverview } from './LeagueOverview'
import { LeaguePlayers } from './LeaguePlayers'
import { LeagueRanking } from './LeagueRanking'
import { LeaguesPage } from './LeaguesPage'
import { cupMatch, detail, league, player, side } from './leagueFixture'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
let supporter = true

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      get: (...args: unknown[]) => get(...args),
      post: (...args: unknown[]) => post(...args),
      delete: (...args: unknown[]) => del(...args),
    },
  }
})

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'id-samuel', is_supporter: supporter } }),
}))

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/leagues" element={<LeaguesPage />} />
          <Route path="/leagues/new" element={<LeagueCreatePage />} />
          <Route path="/leagues/:leagueId" element={<LeagueLayout />}>
            <Route index element={<LeagueOverview />} />
            <Route path="ranking" element={<LeagueRanking />} />
            <Route path="games" element={<LeagueGames />} />
            <Route path="players" element={<LeaguePlayers />} />
          </Route>
          <Route path="/quiz/:sessionId" element={<p>quiz aberto</p>} />
          <Route path="/apoie" element={<p>tela de apoio</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** Serves one league detail (and an empty friends list) to whatever asks. */
function serve(data: LeagueDetail) {
  get.mockImplementation((path: string) =>
    path === '/friends'
      ? Promise.resolve({
          friends: [player('rute'), player('maria')],
          incoming: [],
          sent: [],
          limit: 70,
        })
      : Promise.resolve(data)
  )
}

beforeEach(() => {
  supporter = true
  get.mockReset()
  post.mockReset()
  del.mockReset()
})

describe('LeaguesPage', () => {
  it('files leagues under invites, running, waiting and history', async () => {
    get.mockResolvedValue({
      can_play: true,
      leagues: [
        league({ id: 'a', name: 'Convite da Maria', my_status: 'invited', status: 'recruiting' }),
        league({
          id: 'b',
          name: 'Copa dos Jovens',
          format: 'cup',
          rounds: null,
          my_match_id: 'm1',
        }),
        league({ id: 'c', name: 'Liga Nova', status: 'recruiting' }),
        league({ id: 'd', name: 'Liga Antiga', status: 'finished', champion: player('ana') }),
        league({ id: 'e', name: 'Copa Parada', format: 'cup', status: 'incomplete' }),
      ],
    })
    renderAt('/leagues')

    const invites = (await screen.findByRole('heading', { name: 'Convites · 1' })).closest(
      'section'
    )!
    expect(within(invites).getByText('Convite da Maria')).toBeInTheDocument()
    const running = screen.getByRole('heading', { name: 'Em andamento · 1' }).closest('section')!
    expect(within(running).getByText('Copa dos Jovens')).toBeInTheDocument()
    expect(within(running).getByText('Sua vez')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aguardando início · 1' })).toBeInTheDocument()
    const past = screen.getByRole('heading', { name: 'Encerradas · 2' }).closest('section')!
    expect(within(past).getByText('Campeão: @ana')).toBeInTheDocument()
    expect(within(past).getByText(/sem campeão/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar liga' })).toBeInTheDocument()
  })

  it('lets a non-supporter look but points to supporting instead of creating', async () => {
    get.mockResolvedValue({ can_play: false, leagues: [] })
    renderAt('/leagues')
    expect(await screen.findByText('As ligas são para Mavva Apoiadores')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar liga' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apoiar o Mavva' })).toBeInTheDocument()
  })
})

describe('LeagueCreatePage', () => {
  const categories = Array.from({ length: 9 }, (_, index) => ({
    id: index + 1,
    slug: `tema${index}`,
    name: `Tema ${index + 1}`,
    description: '',
    icon: '📖',
    question_count: 30,
    answered: 0,
    accuracy: null,
  }))

  /** The form reads the categories; after creating, the new league's page loads. */
  function serveCreate() {
    const created = detail({ id: 'nova', status: 'recruiting' })
    get.mockImplementation((path: string) =>
      path === '/categories'
        ? Promise.resolve(categories)
        : path === '/friends'
          ? Promise.resolve({ friends: [], incoming: [], sent: [], limit: 70 })
          : Promise.resolve(created)
    )
    post.mockResolvedValue(created)
  }

  it('needs a name, seven topics and one difficulty before it can be created', async () => {
    const user = userEvent.setup()
    serveCreate()
    renderAt('/leagues/new')

    const submit = screen.getByRole('button', { name: 'Criar liga e convidar jogadores' })
    // The form says what the name needs and what still blocks the button.
    expect(screen.getByText('Mínimo de 3 letras')).toBeInTheDocument()
    expect(screen.getByText('0/40')).toBeInTheDocument()
    expect(screen.getByText(/um nome com pelo menos 3 letras; 7 temas/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome da liga'), 'Li')
    expect(screen.getByText(/um nome com pelo menos 3 letras/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Nome da liga'))
    await user.type(screen.getByLabelText('Nome da liga'), 'Liga da Célula')
    expect(screen.getByText('14/40')).toBeInTheDocument()
    expect(screen.queryByText(/um nome com pelo menos/)).not.toBeInTheDocument()
    for (const index of [1, 2, 3, 4, 5, 6]) {
      await user.click(await screen.findByRole('button', { name: `Tema ${index}` }))
    }
    expect(screen.getByText(/6 escolhidos · mínimo 7/)).toBeInTheDocument()
    expect(screen.getByText(/Para criar a liga, falta:/).parentElement).toHaveTextContent(
      'mais 1 tema.'
    )
    expect(submit).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Tema 7' }))
    expect(submit).toBeEnabled()
    expect(screen.queryByText(/Para criar a liga, falta:/)).not.toBeInTheDocument()
    // No difficulty left: blocked again.
    for (const name of ['Fácil', 'Médio', 'Difícil']) {
      await user.click(screen.getByRole('button', { name }))
    }
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Especialista' }))

    await user.click(screen.getByRole('radio', { name: /Copa/ }))
    expect(screen.queryByLabelText('Quantas rodadas')).not.toBeInTheDocument()
    await user.click(submit)

    expect(post).toHaveBeenCalledWith(
      '/leagues',
      expect.objectContaining({
        name: 'Liga da Célula',
        format: 'cup',
        rounds: null,
        category_ids: [1, 2, 3, 4, 5, 6, 7],
        difficulties: ['expert'],
      })
    )
  })

  it('sends the rounds of a points league and can pick every topic at once', async () => {
    const user = userEvent.setup()
    serveCreate()
    renderAt('/leagues/new')

    await user.type(screen.getByLabelText('Nome da liga'), 'Liga')
    await user.click(await screen.findByRole('button', { name: 'Selecionar todos' }))
    const rounds = screen.getByLabelText('Quantas rodadas')
    await user.clear(rounds)
    await user.type(rounds, '8')
    await user.click(screen.getByRole('button', { name: 'Criar liga e convidar jogadores' }))

    expect(post).toHaveBeenCalledWith(
      '/leagues',
      expect.objectContaining({
        format: 'points',
        rounds: 8,
        category_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      })
    )
  })

  it('shows the supporter notice instead of the form to everyone else', () => {
    supporter = false
    get.mockResolvedValue(categories)
    renderAt('/leagues/new')
    expect(screen.getByText('As ligas são para Mavva Apoiadores')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome da liga')).not.toBeInTheDocument()
  })
})

describe('a league and its own menu', () => {
  it('has its own navigation and says whose turn it is', async () => {
    serve(detail({ my_match_id: 'round-2' }))
    renderAt('/leagues/league-1')

    const menu = await screen.findByRole('navigation', { name: 'Menu da liga Liga da Célula' })
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Visão geral', 'Ranking', 'Rodadassua vez', 'Jogadores'])
    expect(screen.getByText('Você tem uma rodada para jogar')).toBeInTheDocument()
  })

  it('opens the session when the player goes to play', async () => {
    const user = userEvent.setup()
    serve(detail({ my_match_id: 'round-2' }))
    post.mockResolvedValue({ session_id: 'sess-9' })
    renderAt('/leagues/league-1')

    await user.click(await screen.findByRole('button', { name: 'Jogar agora' }))
    expect(post).toHaveBeenCalledWith('/leagues/league-1/matches/round-2/play')
    expect(await screen.findByText('quiz aberto')).toBeInTheDocument()
  })

  it('shows everything to a non-supporter but sends them to support instead of playing', async () => {
    serve(detail({ my_match_id: 'round-2', can_play: false }))
    renderAt('/leagues/league-1')
    expect(await screen.findByText('As ligas são para Mavva Apoiadores')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Jogar agora' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apoie para jogar' })).toBeInTheDocument()
  })

  it('only lets a cup start with a full bracket', async () => {
    serve(detail({ status: 'recruiting', format: 'cup', rounds: null, member_count: 6 }))
    renderAt('/leagues/league-1')
    expect(
      await screen.findByText(
        'Para fechar as chaves, a copa precisa de 2, 4, 8 ou 16 jogadores. Com 6, convide mais 2 ou remova 2.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Começar agora' })).toBeDisabled()
  })

  it('asks before deleting a league, in a modal', async () => {
    const user = userEvent.setup()
    serve(detail({ status: 'recruiting', member_count: 2 }))
    del.mockResolvedValue(undefined)
    get.mockImplementation((path: string) =>
      path === '/leagues'
        ? Promise.resolve({ can_play: true, leagues: [] })
        : Promise.resolve(detail({ status: 'recruiting', member_count: 2 }))
    )
    renderAt('/leagues/league-1')

    await user.click(await screen.findByRole('button', { name: 'Apagar liga' }))
    const dialog = screen.getByRole('dialog', { name: 'Apagar liga' })
    expect(dialog).toHaveTextContent('Apagar a liga “Liga da Célula”?')
    expect(dialog).toHaveTextContent('Isso não pode ser desfeito.')
    expect(del).not.toHaveBeenCalled()

    // Cancelling keeps the league.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Apagar liga' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Apagar liga' })).getByRole('button', {
        name: 'Apagar liga',
      })
    )
    expect(del).toHaveBeenCalledWith('/leagues/league-1')
    expect(await screen.findByRole('heading', { name: 'Ligas' })).toBeInTheDocument()
  })

  it('starts a ready league and lands on the fixtures', async () => {
    const user = userEvent.setup()
    serve(detail({ status: 'recruiting', format: 'cup', rounds: null, member_count: 4 }))
    post.mockResolvedValue(
      detail({
        format: 'cup',
        rounds: null,
        bracket: [
          {
            round: 1,
            label: 'Semifinal',
            matches: [cupMatch(1, side('samuel'), side('maria'))],
          },
        ],
      })
    )
    renderAt('/leagues/league-1')
    await user.click(await screen.findByRole('button', { name: 'Começar agora' }))
    expect(post).toHaveBeenCalledWith('/leagues/league-1/start')
    expect(await screen.findByRole('heading', { name: 'Chaveamento' })).toBeInTheDocument()
  })

  it('lets an invited supporter accept', async () => {
    const user = userEvent.setup()
    serve(
      detail({
        status: 'recruiting',
        my_status: 'invited',
        is_owner: false,
        owner: player('maria'),
      })
    )
    post.mockResolvedValue(detail({ status: 'recruiting', is_owner: false }))
    renderAt('/leagues/league-1')
    expect(await screen.findByText('@maria convidou você para esta liga')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }))
    expect(post).toHaveBeenCalledWith('/leagues/league-1/join')
    await waitFor(() => expect(screen.queryByText(/convidou você/)).not.toBeInTheDocument())
  })

  it('crowns the champion and explains an incomplete cup', async () => {
    serve(detail({ status: 'finished', champion: player('maria') }))
    renderAt('/leagues/league-1')
    expect(await screen.findByText('Campeão da liga')).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
  })
})

describe('LeagueGames', () => {
  it('draws the bracket: seats to be filled, third place, scores once decided', async () => {
    serve(
      detail({
        format: 'cup',
        rounds: null,
        my_match_id: 'match-2',
        standings: detail().standings,
        bracket: [
          {
            round: 1,
            label: 'Semifinal',
            matches: [
              cupMatch(
                1,
                side('maria', {
                  played: true,
                  score: { points: 160, correct: 8, time_seconds: 95 },
                }),
                side('joao', {
                  played: true,
                  score: { points: 60, correct: 3, time_seconds: 120 },
                }),
                { winner_id: 'id-maria', decided_by: 'points' }
              ),
              cupMatch(2, side('samuel'), side('ana', { played: true })),
            ],
          },
          {
            round: 2,
            label: 'Final',
            matches: [
              cupMatch(3, side('maria'), side(null, { from_match: 2 })),
              cupMatch(4, side('joao'), side(null, { from_match: 2, from_loser: true }), {
                third_place: true,
              }),
            ],
          },
        ],
      })
    )
    renderAt('/leagues/league-1/games')

    expect(await screen.findByRole('heading', { name: 'Final' })).toBeInTheDocument()
    const first = screen.getByText('Jogo 1').closest('li')!
    expect(within(first).getByText('160')).toBeInTheDocument()
    expect(within(first).getByText('Decidido nos pontos')).toBeInTheDocument()

    // My own match: the opponent has played, the score stays hidden, I can play.
    const mine = screen.getByText('Jogo 2').closest('li')!
    expect(within(mine).getByText('Você')).toBeInTheDocument()
    expect(within(mine).getByText('jogou')).toBeInTheDocument()
    expect(within(mine).getByText('falta jogar')).toBeInTheDocument()
    expect(within(mine).getByRole('button', { name: 'Jogar meu duelo' })).toBeInTheDocument()

    // The final waits for the winner of my match; third place, for its loser.
    const final = screen.getByText('Jogo 3').closest('li')!
    expect(within(final).getByText('Vencedor do jogo 2')).toBeInTheDocument()
    const third = screen.getByText('Disputa de 3º lugar · jogo 4').closest('li')!
    expect(within(third).getByText('@joao')).toBeInTheDocument()
    expect(within(third).getByText('Perdedor do jogo 2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Jogar/ })).toHaveLength(1)
  })

  it('lists the rounds of a points league with my scores and the next one to play', async () => {
    serve(
      detail({
        my_match_id: 'r2',
        rounds_played: [
          {
            match_id: 'r1',
            round: 1,
            played_count: 4,
            my_score: { points: 140, correct: 7, time_seconds: 130 },
            in_progress: false,
          },
          { match_id: 'r2', round: 2, played_count: 1, my_score: null, in_progress: true },
          { match_id: 'r3', round: 3, played_count: 0, my_score: null, in_progress: false },
        ],
      })
    )
    renderAt('/leagues/league-1/games')

    const rounds = await screen.findAllByRole('listitem')
    expect(rounds[0]).toHaveTextContent('Rodada 1')
    expect(rounds[0]).toHaveTextContent('140 pts')
    expect(rounds[0]).toHaveTextContent('7/10')
    expect(within(rounds[1]).getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
    expect(rounds[2]).toHaveTextContent('depois da anterior')
  })

  it('says the draw happens at the start while the league is gathering players', async () => {
    serve(detail({ status: 'recruiting', format: 'cup', rounds: null }))
    renderAt('/leagues/league-1/games')
    expect(await screen.findByText(/sorteado quando a liga começar/)).toBeInTheDocument()
  })
})

describe('LeagueRanking and LeaguePlayers', () => {
  it('ranks a points league by points, marking me', async () => {
    serve(detail())
    renderAt('/leagues/league-1/ranking')
    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('1º')
    expect(rows[0]).toHaveTextContent('Você · @samuel')
    expect(rows[0]).toHaveTextContent('300 pts')
    expect(rows[1]).toHaveTextContent('@maria')
    expect(rows[1]).toHaveTextContent('2/3 rodadas')
  })

  it('ranks a cup by who is still in, with the champion on top', async () => {
    const base = detail()
    serve(
      detail({
        format: 'cup',
        rounds: null,
        status: 'finished',
        champion: player('maria'),
        standings: [
          { ...base.standings[1], position: 1, wins: 2, podium: 1 },
          { ...base.standings[0], position: 2, wins: 1, eliminated: true, podium: 2 },
          { ...base.standings[2], position: 3, wins: 0, eliminated: true, podium: 3 },
          { ...base.standings[3], position: 4, wins: 0, eliminated: true, podium: null },
        ],
      })
    )
    renderAt('/leagues/league-1/ranking')
    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Campeão')
    expect(rows[0]).toHaveTextContent('2 vitórias')
    expect(rows[1]).toHaveTextContent('Vice-campeão')
    expect(rows[2]).toHaveTextContent('3º lugar')
    expect(rows[3]).toHaveTextContent('Eliminado')
  })

  it('lets the owner invite by username or from friends, and remove players', async () => {
    const user = userEvent.setup()
    const recruiting = detail({ status: 'recruiting', member_count: 4, invited_count: 0 })
    serve(recruiting)
    post.mockResolvedValue(recruiting)
    del.mockResolvedValue(recruiting)
    renderAt('/leagues/league-1/players')

    await user.type(await screen.findByLabelText('Nome de usuário'), '@Davi')
    await user.click(screen.getByRole('button', { name: 'Convidar' }))
    expect(post).toHaveBeenCalledWith('/leagues/league-1/invites', { username: 'davi' })

    // The friends open in a modal that says where each one stands.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver lista de amigos' }))
    const dialog = await screen.findByRole('dialog', { name: 'Convidar amigos' })
    expect(dialog).toHaveTextContent('Restam 16 vagas na liga.')
    const friends = await within(dialog).findByRole('list', { name: 'Seus amigos' })
    const rows = within(friends).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('@rute'),
      expect.stringContaining('@maria'),
    ])
    expect(rows[1]).toHaveTextContent('Na liga')
    await user.click(within(rows[0]).getByRole('button', { name: 'Convidar @rute' }))
    expect(post).toHaveBeenCalledWith('/leagues/league-1/invites', { username: 'rute' })
    // It stays open to invite more, and closes on demand.
    expect(screen.getByRole('dialog', { name: 'Convidar amigos' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText(/Restam 16 vagas de 20/)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0])
    expect(del).toHaveBeenCalledWith('/leagues/league-1/members/id-maria')
  })

  it('points to the friends screen when the admin has no friends yet', async () => {
    const user = userEvent.setup()
    const recruiting = detail({ status: 'recruiting' })
    get.mockImplementation((path: string) =>
      path === '/friends'
        ? Promise.resolve({ friends: [], incoming: [], sent: [], limit: 70 })
        : Promise.resolve(recruiting)
    )
    renderAt('/leagues/league-1/players')
    await user.click(await screen.findByRole('button', { name: 'Ver lista de amigos' }))
    expect(await screen.findByText(/Você ainda não tem amigos no Mavva/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Adicionar amigos' })).toBeInTheDocument()
  })

  it('shows the players without the invite tools once the league has started', async () => {
    serve(detail())
    renderAt('/leagues/league-1/players')
    expect(await screen.findByText('Jogadores · 4')).toBeInTheDocument()
    // Whoever created the league is its "Admin".
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome de usuário')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
  })
})

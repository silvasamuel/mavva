import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccuracyEntry,
  AccuracyLeaderboard,
  LeaderboardEntry,
  PlayerProfile,
  PublicUser,
} from '@/types/api'
import { RankingPage } from './RankingPage'

const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiError: class ApiError extends Error {},
}))

function player(id: string, username: string): PublicUser {
  return {
    id,
    username,
    name: username.toUpperCase(),
    level: 3,
    rank: { code: 'semente', name: 'Semente' },
    duel_wins: 0,
    duel_losses: 0,
    duel_draws: 0,
  }
}

function entry(position: number, user: PublicUser, isMe = false): LeaderboardEntry {
  return { position, total_xp: 1000 - position * 100, is_me: isMe, user }
}

function accuracyEntry(
  position: number,
  user: PublicUser,
  correct: number,
  answered: number,
  isMe = false
): AccuracyEntry {
  return {
    position,
    accuracy: correct / answered,
    questions_answered: answered,
    correct_answers: correct,
    is_me: isMe,
    user,
  }
}

const ana = player('u-ana', 'ana')
const me = player('u-me', 'samuel')

let accuracyBoard: AccuracyLeaderboard

function profileOf(user: PublicUser): PlayerProfile {
  return {
    user,
    relation: user.id === me.id ? 'self' : 'none',
    member_since: '2026-01',
    stats: {
      total_xp: 900,
      current_streak: 0,
      longest_streak: 0,
      questions_answered: 0,
      accuracy: null,
      perfect_sessions: 0,
    },
    best_rank: { code: 'semente', name: 'Semente' },
    last_season_rank: null,
    achievements_unlocked: 0,
    achievements_total: 32,
    recent_achievements: [],
    strongest_categories: [],
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RankingPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RankingPage', () => {
  beforeEach(() => {
    accuracyBoard = {
      elo: null,
      elos: [
        { code: 'espiga', name: 'Espiga' },
        { code: 'videira', name: 'Videira' },
        { code: 'oliveira', name: 'Oliveira' },
        { code: 'cedro', name: 'Cedro' },
        { code: 'celeiro', name: 'Celeiro' },
      ],
      min_rank: { code: 'espiga', name: 'Espiga' },
      min_level: 11,
      eligible: false,
      top: [accuracyEntry(1, ana, 140, 160)],
      me: null,
      total_players: 1,
    }
    get.mockReset().mockImplementation(async (path: string) => {
      if (path === '/ranking/global') {
        return {
          season: {
            number: 2,
            name: 'outubro de 2026',
            starts_on: '2026-10-01',
            ends_on: '2026-11-01',
            days_left: 23,
          },
          top: [entry(1, ana)],
          me: entry(7, me, true),
          total_players: 20,
        }
      }
      if (path === '/ranking/friends') return { entries: [entry(1, me, true)] }
      if (path.startsWith('/ranking/accuracy')) {
        const elo = new URLSearchParams(path.split('?')[1]).get('elo')
        return { ...accuracyBoard, elo }
      }
      if (path === '/players/u-ana') return profileOf(ana)
      if (path === '/players/u-me') return profileOf(me)
      throw new Error(`unexpected ${path}`)
    })
  })

  it('lists the tabs as Global, Precisão, Amigos', async () => {
    renderPage()
    const nav = await screen.findByRole('navigation', { name: 'Tipo de ranking' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Global',
      'Precisão',
      'Amigos',
    ])
  })

  it('shows the season and when it ends', async () => {
    renderPage()
    const season = await screen.findByRole('region', { name: 'Temporada' })
    expect(season).toHaveTextContent('Temporada de outubro de 2026 · termina em 23 dias')
    expect(season).toHaveTextContent(/XP, nível e o ranking de XP recomeçam/)
  })

  it('opens the profile of the player tapped in the ranking', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /@ana/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Perfil de ANA' })
    expect(get).toHaveBeenCalledWith('/players/u-ana')
    expect(within(dialog).getByText('@ana')).toBeInTheDocument()
  })

  it('opens your own profile from “Sua posição”', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /você · @samuel/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Perfil de SAMUEL' })
    expect(within(dialog).getByText('Você')).toBeInTheDocument()
  })

  describe('Precisão tab', () => {
    async function openAccuracyTab() {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Precisão' }))
      await screen.findByText(/Só entra neste ranking quem já chegou ao elo Espiga \(nível 11\)/)
      return user
    }

    it('lists the top players with their accuracy and answer count', async () => {
      accuracyBoard.top = [
        accuracyEntry(1, ana, 140, 160),
        accuracyEntry(2, player('u-bia', 'bia'), 1300, 2000),
      ]
      await openAccuracyTab()

      const ranking = within(screen.getByRole('list'))
      expect(ranking.getByText('88%')).toBeInTheDocument()
      expect(ranking.getByText('160 respondidas')).toBeInTheDocument()
      expect(ranking.getByText('65%')).toBeInTheDocument()
      expect(ranking.getByText('2.000 respondidas')).toBeInTheDocument()
    })

    it('tells players below Espiga when they will enter', async () => {
      await openAccuracyTab()

      expect(
        screen.getByText('Você entra neste ranking ao chegar ao elo Espiga.')
      ).toBeInTheDocument()
      expect(screen.queryByText(/sua posição/i)).not.toBeInTheDocument()
    })

    it('filters by elo, starting at Espiga', async () => {
      accuracyBoard.eligible = true
      const user = await openAccuracyTab()

      const filter = screen.getByRole('group', { name: 'Filtrar por elo' })
      expect(within(filter).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Todos',
        'Espiga',
        'Videira',
        'Oliveira',
        'Cedro',
        'Celeiro',
      ])
      expect(within(filter).getByRole('button', { name: 'Todos' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )

      await user.click(within(filter).getByRole('button', { name: 'Videira' }))

      expect(get).toHaveBeenCalledWith('/ranking/accuracy?elo=videira')
      expect(within(filter).getByRole('button', { name: 'Videira' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      expect(await screen.findByText('Você não está no elo Videira.')).toBeInTheDocument()
    })

    it('shows an empty state while nobody qualifies', async () => {
      accuracyBoard = { ...accuracyBoard, top: [], total_players: 0 }
      await openAccuracyTab()

      expect(screen.getByText('Ninguém entrou neste ranking ainda.')).toBeInTheDocument()
    })

    it('shows your own position when you qualify outside the top 10', async () => {
      accuracyBoard = {
        ...accuracyBoard,
        eligible: true,
        me: accuracyEntry(14, me, 61, 100, true),
        total_players: 30,
      }
      await openAccuracyTab()

      expect(screen.getByText('Sua posição · 14º de 30')).toBeInTheDocument()
      const mine = screen.getByRole('button', { name: /você · @samuel/i })
      expect(within(mine).getByText('61%')).toBeInTheDocument()
      expect(within(mine).getByText('100 respondidas')).toBeInTheDocument()
      expect(screen.queryByText(/você entra neste ranking/i)).not.toBeInTheDocument()
    })

    it('opens the profile of the player tapped in the accuracy board', async () => {
      const user = await openAccuracyTab()

      await user.click(screen.getByRole('button', { name: /@ana/ }))

      const dialog = await screen.findByRole('dialog', { name: 'Perfil de ANA' })
      expect(get).toHaveBeenCalledWith('/players/u-ana')
      expect(within(dialog).getByText('@ana')).toBeInTheDocument()
    })
  })
})

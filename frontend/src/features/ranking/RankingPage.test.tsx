import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaderboardEntry, PlayerProfile, PublicUser } from '@/types/api'
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

const ana = player('u-ana', 'ana')
const me = player('u-me', 'samuel')

function profileOf(user: PublicUser): PlayerProfile {
  return {
    user,
    relation: user.id === me.id ? 'self' : 'none',
    member_since: '2026-01',
    stats: {
      total_xp: 900,
      xp_into_level: 10,
      xp_for_next_level: 200,
      current_streak: 0,
      longest_streak: 0,
      questions_answered: 0,
      accuracy: null,
      perfect_sessions: 0,
    },
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
    get.mockReset().mockImplementation(async (path: string) => {
      if (path === '/ranking/global') {
        return { top: [entry(1, ana)], me: entry(7, me, true), total_players: 20 }
      }
      if (path === '/ranking/friends') return { entries: [entry(1, me, true)] }
      if (path === '/players/u-ana') return profileOf(ana)
      if (path === '/players/u-me') return profileOf(me)
      throw new Error(`unexpected ${path}`)
    })
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
})

import type { League, LeagueCupMatch, LeagueDetail, LeagueSide, PublicUser } from '@/types/api'

export function player(username: string, overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: `id-${username}`,
    username,
    name: username.charAt(0).toUpperCase() + username.slice(1),
    level: 3,
    rank: { code: 'broto', name: 'Broto' },
    duel_wins: 0,
    duel_losses: 0,
    duel_draws: 0,
    wisdom_level: 2,
    contributor_tier: null,
    is_supporter: true,
    supporter_months: 1,
    ...overrides,
  }
}

export function league(overrides: Partial<League> = {}): League {
  return {
    id: 'league-1',
    name: 'Liga da Célula',
    format: 'points',
    status: 'active',
    rounds: 3,
    ends_on: '2026-12-20',
    ends_at: '2026-12-21T03:00:00Z',
    created_at: '2026-11-13T12:00:00Z',
    started_at: '2026-11-13T13:00:00Z',
    finished_at: null,
    owner: player('samuel'),
    is_owner: true,
    my_status: 'active',
    member_count: 4,
    invited_count: 0,
    max_members: 20,
    champion: null,
    my_match_id: null,
    ...overrides,
  }
}

export function detail(overrides: Partial<LeagueDetail> = {}): LeagueDetail {
  const members = ['samuel', 'maria', 'joao', 'ana'].map((name) => player(name))
  return {
    ...league(),
    can_play: true,
    categories: Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      slug: `tema${index}`,
      name: `Tema ${index + 1}`,
      icon: '📖',
    })),
    difficulties: ['medium', 'hard'],
    question_count: 10,
    timer_seconds: 20,
    members: members.map((user, index) => ({ user, status: 'active', is_owner: index === 0 })),
    standings: members.map((user, index) => ({
      position: index + 1,
      user,
      is_me: index === 0,
      points: 300 - index * 50,
      correct: 12 - index,
      time_seconds: 200 + index * 10,
      played: 2,
      wins: 0,
      eliminated: false,
    })),
    rounds_played: [],
    bracket: [],
    ...overrides,
  }
}

export function side(username: string | null, overrides: Partial<LeagueSide> = {}): LeagueSide {
  return {
    user: username ? player(username) : null,
    from_match: null,
    played: false,
    score: null,
    ...overrides,
  }
}

export function cupMatch(
  number: number,
  a: LeagueSide,
  b: LeagueSide,
  overrides: Partial<LeagueCupMatch> = {}
): LeagueCupMatch {
  return { id: `match-${number}`, number, a, b, winner_id: null, decided_by: null, ...overrides }
}

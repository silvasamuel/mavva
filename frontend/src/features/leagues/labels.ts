import type { League, LeagueFormat, LeagueStatus } from '@/types/api'

export const FORMAT_LABEL: Record<LeagueFormat, string> = {
  points: 'Pontos',
  cup: 'Copa',
}

export const STATUS_LABEL: Record<LeagueStatus, string> = {
  recruiting: 'Aguardando início',
  active: 'Em andamento',
  finished: 'Encerrada',
  incomplete: 'Não completada',
}

export const STATUS_PILL: Record<LeagueStatus, string> = {
  recruiting: 'bg-grain-100 text-grain-800',
  active: 'bg-leaf-100 text-leaf-800',
  finished: 'bg-sand-100 text-sand-700',
  incomplete: 'bg-red-50 text-red-700',
}

/** "Copa · 8 jogadores" / "Pontos · 5 rodadas · 8 jogadores". */
export function leagueTagline(league: League): string {
  const players = `${league.member_count} ${league.member_count === 1 ? 'jogador' : 'jogadores'}`
  if (league.format === 'points' && league.rounds != null) {
    const rounds = `${league.rounds} ${league.rounds === 1 ? 'rodada' : 'rodadas'}`
    return `${FORMAT_LABEL.points} · ${rounds} · ${players}`
  }
  return `${FORMAT_LABEL[league.format]} · ${players}`
}

/** Seconds as "3 min 20 s", for a round's clock. */
export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest} s`
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

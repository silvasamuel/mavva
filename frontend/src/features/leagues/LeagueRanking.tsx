import { useState } from 'react'
import type { LeagueStanding, PublicUser } from '@/types/api'
import { Card, CardTitle } from '@/components/ui/Card'
import { PlayerProfileModal } from '@/components/PlayerProfileModal'
import { PlayerSeals } from '@/components/PlayerSeals'
import { RankBadge } from '@/components/RankBadge'
import { AppIcons, Glyph } from '@/lib/icons'
import { useLeague } from './useLeague'
import { formatClock } from './labels'

function detail(row: LeagueStanding, cup: boolean, rounds: number | null): string {
  if (cup) {
    const wins = `${row.wins} ${row.wins === 1 ? 'vitória' : 'vitórias'}`
    return row.played === 0 ? 'ainda não jogou' : `${wins} · ${row.points} pts`
  }
  if (row.played === 0) return 'ainda não jogou'
  const played = rounds != null ? `${row.played}/${rounds} rodadas` : `${row.played} rodadas`
  return `${played} · ${row.correct} acertos · ${formatClock(row.time_seconds)}`
}

/** The league's own table: points for a points league, bracket progress for a cup. */
export function LeagueRanking() {
  const league = useLeague()
  const [opened, setOpened] = useState<PublicUser | null>(null)
  const cup = league.format === 'cup'
  const started = league.status !== 'recruiting'
  const championId = league.champion?.id

  return (
    <Card>
      <CardTitle>Ranking da liga</CardTitle>
      <p className="-mt-2 mb-3 text-xs font-semibold text-sand-500">
        {cup
          ? 'Quem foi mais longe no chaveamento fica na frente.'
          : 'Mais pontos na frente; no empate, menos tempo.'}
      </p>
      {!started ? (
        <p className="py-4 text-sm font-semibold text-sand-400">
          O ranking começa a contar quando a liga começar.
        </p>
      ) : (
        <ol className="divide-y divide-sand-100">
          {league.standings.map((row) => {
            const champion = row.user.id === championId
            return (
              <li key={row.user.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setOpened(row.user)}
                  className={`flex w-full items-center gap-3 rounded-2xl py-3 text-left transition-colors hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500 ${
                    row.is_me ? 'bg-grain-50 px-3 hover:bg-grain-100' : 'px-1'
                  }`}
                >
                  <span
                    className={`w-8 shrink-0 text-right text-sm font-extrabold tabular-nums ${
                      row.position <= 3 ? 'text-grain-700' : 'text-sand-400'
                    }`}
                  >
                    {row.position}º
                  </span>
                  <RankBadge code={row.user.rank.code} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-extrabold text-ink">
                      <span className="truncate">
                        {row.is_me ? `Você · @${row.user.username}` : `@${row.user.username}`}
                      </span>
                      <PlayerSeals of={row.user} />
                    </p>
                    <p className="truncate text-xs font-semibold text-sand-500">
                      {detail(row, cup, league.rounds)}
                    </p>
                  </div>
                  {champion ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-grain-400 px-2.5 py-1 text-xs font-extrabold text-grain-900">
                      <Glyph as={AppIcons.crown} className="h-4 w-4" />
                      Campeão
                    </span>
                  ) : cup ? (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                        row.eliminated ? 'bg-sand-100 text-sand-500' : 'bg-leaf-100 text-leaf-800'
                      }`}
                    >
                      {row.eliminated ? 'Eliminado' : 'Na disputa'}
                    </span>
                  ) : (
                    <span className="shrink-0 text-right text-sm font-extrabold tabular-nums text-leaf-700">
                      {row.points.toLocaleString('pt-BR')} pts
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <PlayerProfileModal
        userId={opened?.id ?? null}
        preview={opened}
        onClose={() => setOpened(null)}
      />
    </Card>
  )
}

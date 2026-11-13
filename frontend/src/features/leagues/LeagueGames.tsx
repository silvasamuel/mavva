import type { LeagueCupMatch, LeagueDetail, LeagueSide } from '@/types/api'
import { Card, CardTitle } from '@/components/ui/Card'
import { RankBadge } from '@/components/RankBadge'
import { AppIcons, Glyph } from '@/lib/icons'
import { useLeague } from './useLeague'
import { PlayButton } from './PlayButton'
import { formatClock } from './labels'

const DECIDED_BY: Record<NonNullable<LeagueCupMatch['decided_by']>, string> = {
  points: 'Decidido nos pontos',
  time: 'Empate nos pontos: decidido no tempo',
  lots: 'Empate em tudo: decidido por sorteio',
}

function SideRow({
  side,
  won,
  lost,
  mine,
}: {
  side: LeagueSide
  won: boolean
  lost: boolean
  mine: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${
        won ? 'bg-leaf-50 ring-1 ring-leaf-200' : ''
      } ${lost ? 'opacity-55' : ''}`}
    >
      {side.user ? (
        <RankBadge code={side.user.rank.code} size="xs" />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-sand-300" />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          side.user ? 'font-extrabold text-ink' : 'font-semibold italic text-sand-400'
        }`}
      >
        {side.user
          ? `${mine ? 'Você' : `@${side.user.username}`}`
          : side.from_match != null
            ? `Vencedor do jogo ${side.from_match}`
            : 'A definir'}
      </span>
      {side.score ? (
        <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink">
          {side.score.points}
        </span>
      ) : side.user ? (
        <span
          className={`shrink-0 text-[11px] font-bold ${side.played ? 'text-leaf-700' : 'text-sand-400'}`}
        >
          {side.played ? 'jogou' : 'falta jogar'}
        </span>
      ) : null}
      {won && <Glyph as={AppIcons.check} className="h-4 w-4 shrink-0 text-leaf-600" />}
    </div>
  )
}

function CupMatch({
  match,
  league,
  myId,
}: {
  match: LeagueCupMatch
  league: LeagueDetail
  myId: string | undefined
}) {
  const decided = match.winner_id != null
  const isMine = league.my_match_id === match.id
  const sides = [match.a, match.b]
  return (
    <li
      className={`w-56 rounded-2xl bg-white p-2 shadow-card ${
        isMine ? 'ring-2 ring-leaf-400' : 'ring-1 ring-sand-100'
      }`}
    >
      <p className="mb-1 px-2 text-[11px] font-extrabold uppercase tracking-wide text-sand-400">
        Jogo {match.number}
      </p>
      <div className="space-y-1">
        {sides.map((side, index) => (
          <SideRow
            key={index}
            side={side}
            won={decided && side.user?.id === match.winner_id}
            lost={decided && side.user?.id !== match.winner_id}
            mine={side.user != null && side.user.id === myId}
          />
        ))}
      </div>
      {decided && match.decided_by && (
        <p className="mt-1.5 px-2 text-[11px] font-semibold text-sand-500">
          {DECIDED_BY[match.decided_by]}
          {match.decided_by === 'time' && match.a.score && match.b.score
            ? ` (${formatClock(match.a.score.time_seconds)} × ${formatClock(match.b.score.time_seconds)})`
            : ''}
        </p>
      )}
      {isMine && (
        <div className="mt-2">
          <PlayButton
            leagueId={league.id}
            matchId={match.id}
            canPlay={league.can_play}
            label="Jogar meu duelo"
            full
          />
        </div>
      )}
    </li>
  )
}

function Bracket({ league }: { league: LeagueDetail }) {
  const myId = league.standings.find((row) => row.is_me)?.user.id
  return (
    <Card>
      <CardTitle>Chaveamento</CardTitle>
      <p className="-mt-2 mb-3 text-xs font-semibold text-sand-500">
        Sorteado no início. Os dois jogadores de cada jogo respondem às mesmas perguntas; os
        placares aparecem quando ambos tiverem jogado.
      </p>
      {/* One column per round, read left to right; on a phone it scrolls sideways. */}
      <div className="-mx-2 overflow-x-auto px-2 pb-2">
        <ol className="flex min-w-max items-stretch gap-4">
          {league.bracket.map((round) => (
            <li key={round.round} className="flex flex-col">
              <h3 className="mb-2 text-center text-xs font-extrabold uppercase tracking-wider text-grain-700">
                {round.label}
              </h3>
              <ul className="flex flex-1 flex-col justify-around gap-3">
                {round.matches.map((match) => (
                  <CupMatch key={match.id} match={match} league={league} myId={myId} />
                ))}
                {round.byes.map((bye, index) => (
                  <li
                    key={`bye-${index}`}
                    className="w-56 rounded-2xl border border-dashed border-sand-300 bg-sand-25 px-3 py-2 text-xs font-semibold text-sand-500"
                  >
                    <span className="font-extrabold text-sand-600">
                      {bye.user
                        ? `@${bye.user.username}`
                        : bye.from_match != null
                          ? `Vencedor do jogo ${bye.from_match}`
                          : 'A definir'}
                    </span>{' '}
                    descansa nesta rodada e avança direto.
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}

function Rounds({ league }: { league: LeagueDetail }) {
  return (
    <Card>
      <CardTitle>Rodadas</CardTitle>
      <p className="-mt-2 mb-3 text-xs font-semibold text-sand-500">
        Em ordem, uma vez cada. Todos respondem às mesmas perguntas em cada rodada.
      </p>
      <ol className="space-y-2">
        {league.rounds_played.map((round) => {
          const next = league.my_match_id === round.match_id
          return (
            <li
              key={round.match_id}
              className={`flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3 ${
                next ? 'bg-leaf-50 ring-2 ring-leaf-300' : 'bg-sand-50'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-extrabold text-ink shadow-card">
                {round.round}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-ink">Rodada {round.round}</p>
                <p className="text-xs font-semibold text-sand-500">
                  {round.played_count} de {league.member_count} jogaram
                </p>
              </div>
              {round.my_score ? (
                <p className="text-right">
                  <span className="block text-sm font-extrabold tabular-nums text-leaf-700">
                    {round.my_score.points} pts
                  </span>
                  <span className="block text-xs font-semibold text-sand-500">
                    {round.my_score.correct}/{league.question_count} ·{' '}
                    {formatClock(round.my_score.time_seconds)}
                  </span>
                </p>
              ) : next ? (
                <PlayButton
                  leagueId={league.id}
                  matchId={round.match_id}
                  canPlay={league.can_play}
                  label={round.in_progress ? 'Continuar' : 'Jogar'}
                />
              ) : (
                <span className="text-xs font-bold text-sand-400">
                  {league.status === 'active' ? 'depois da anterior' : 'não jogada'}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/** The fixtures: the bracket of a cup, or the rounds of a points league. */
export function LeagueGames() {
  const league = useLeague()
  const cup = league.format === 'cup'
  if (
    league.status === 'recruiting' ||
    (league.bracket.length === 0 && league.rounds_played.length === 0)
  ) {
    return (
      <Card>
        <CardTitle>{cup ? 'Chaveamento' : 'Rodadas'}</CardTitle>
        <p className="text-sm font-semibold text-sand-500">
          {league.status !== 'recruiting'
            ? 'Esta liga terminou antes de começar: nada foi sorteado.'
            : cup
              ? 'O chaveamento é sorteado quando a liga começar. Até lá, o dono ainda pode convidar jogadores.'
              : 'As rodadas são sorteadas quando a liga começar. Até lá, o dono ainda pode convidar jogadores.'}
        </p>
      </Card>
    )
  }
  return cup ? <Bracket league={league} /> : <Rounds league={league} />
}

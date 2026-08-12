import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api, ApiError } from '@/lib/api'
import type { Duel, DuelListResponse, FriendsOverview, PublicUser } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { RankBadge } from '@/components/RankBadge'
import { Modal } from '@/components/ui/Modal'
import { formatPercent, formatRelativeDate } from '@/lib/format'

const CLOSED: Duel['status'][] = ['finished', 'expired', 'cancelled']

function statusLabel(duel: Duel): { text: string; tone: string } {
  if (duel.status === 'expired') return { text: 'Expirado', tone: 'bg-sand-100 text-sand-500' }
  if (duel.status === 'cancelled') {
    return duel.my_result === 'win'
      ? { text: 'Vitória (desistência)', tone: 'bg-leaf-100 text-leaf-700' }
      : { text: 'Você desistiu', tone: 'bg-red-50 text-red-600' }
  }
  if (duel.status === 'finished') {
    if (duel.my_result === 'win') return { text: 'Vitória', tone: 'bg-leaf-100 text-leaf-700' }
    if (duel.my_result === 'loss') return { text: 'Derrota', tone: 'bg-red-50 text-red-600' }
    return { text: 'Empate', tone: 'bg-grain-100 text-grain-700' }
  }
  if (!duel.me.finished) return { text: 'Sua vez', tone: 'bg-grain-100 text-grain-800' }
  if (duel.status === 'open') return { text: 'Procurando rival', tone: 'bg-sand-100 text-sand-600' }
  return { text: 'Aguardando rival', tone: 'bg-sand-100 text-sand-600' }
}

function DuelCard({ duel, onPlay }: { duel: Duel; onPlay: (duel: Duel) => void }) {
  const badge = statusLabel(duel)
  const rival = duel.rival.user
  const myTurn = !CLOSED.includes(duel.status) && !duel.me.finished

  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${badge.tone}`}>
              {badge.text}
            </span>
            <span className="text-xs font-bold text-sand-400">
              {duel.mode === 'friend' ? '👥 Amigo' : '🎲 Aleatório'} ·{' '}
              {formatRelativeDate(duel.created_at)}
            </span>
          </div>
          <p className="mt-1 truncate font-extrabold text-ink">
            {rival ? `você vs @${rival.username}` : 'Aguardando um adversário…'}
          </p>
          {(duel.me.finished || duel.rival.finished) && (
            <p className="text-sm font-bold text-sand-600">
              {duel.me.correct} <span className="text-sand-400">×</span>{' '}
              {duel.rival.finished ? duel.rival.correct : '—'}
              {duel.xp_change != null && (
                <span
                  className={`ml-2 ${duel.xp_change >= 0 ? 'text-grain-700' : 'text-red-600'}`}
                >
                  {duel.xp_change > 0 ? `+${duel.xp_change}` : duel.xp_change} XP
                </span>
              )}
            </p>
          )}
        </div>
        {myTurn && (
          <Button onClick={() => onPlay(duel)}>
            {duel.me.answered > 0 ? 'Continuar' : 'Jogar'}
          </Button>
        )}
      </Card>
    </motion.li>
  )
}

export function DuelsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  // Challenging costs XP if you walk out, so it never fires on a single click.
  const [challenging, setChallenging] = useState<PublicUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['duels'],
    queryFn: () => api.get<DuelListResponse>('/duels'),
    // Async duels resolve when the rival plays — poll while the tab is open.
    refetchInterval: 30_000,
  })

  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<FriendsOverview>('/friends'),
  })

  const createDuel = useMutation({
    mutationFn: (opponentUsername?: string) =>
      api.post<Duel>('/duels', { opponent_username: opponentUsername ?? null }),
    onSuccess: (duel) => {
      queryClient.invalidateQueries({ queryKey: ['duels'] })
      setChallenging(null)
      if (duel.my_session_id) navigate(`/quiz/${duel.my_session_id}`)
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o duelo.'),
  })

  function play(duel: Duel) {
    if (duel.my_session_id) navigate(`/quiz/${duel.my_session_id}`)
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const { record } = data

  return (
    <div className="animate-float-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Duelos ⚔️</h1>
          <p className="text-sm font-semibold text-sand-500">
            10 perguntas, 20 segundos cada. Quem acertar mais leva +50 XP.
          </p>
        </div>
      </header>

      {/* Record */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="text-center">
          <p className="text-2xl font-extrabold text-leaf-600">{record.wins}</p>
          <p className="text-xs font-bold uppercase text-sand-500">vitórias</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-extrabold text-red-500">{record.losses}</p>
          <p className="text-xs font-bold uppercase text-sand-500">derrotas</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-extrabold">{formatPercent(record.win_rate)}</p>
          <p className="text-xs font-bold uppercase text-sand-500">aproveitamento</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-extrabold text-grain-600">
            {record.current_streak > 0 ? `🔥 ${record.current_streak}` : record.current_streak}
          </p>
          <p className="text-xs font-bold uppercase text-sand-500">
            seguidas · recorde {record.best_streak}
          </p>
        </Card>
      </div>

      {/* New duel */}
      <Card className="space-y-4">
        <div>
          <CardTitle>Adversário aleatório</CardTitle>
          <p className="mb-3 -mt-2 text-xs font-semibold text-sand-500">
            Entra na fila e enfrenta quem estiver procurando partida.
          </p>
          <Button loading={createDuel.isPending} onClick={() => createDuel.mutate(undefined)}>
            🎲 Procurar partida
          </Button>
        </div>

        <div className="border-t border-sand-100 pt-4">
          <CardTitle>Desafiar um amigo</CardTitle>
          {friendsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6 text-leaf-500" />
            </div>
          ) : friends && friends.friends.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {friends.friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex flex-col gap-3 rounded-2xl bg-sand-25 p-3 ring-1 ring-sand-100 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <RankBadge code={friend.rank.code} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-ink">{friend.name}</p>
                      <p className="truncate text-xs font-semibold text-sand-500">
                        @{friend.username}
                      </p>
                      <p className="text-xs font-semibold text-sand-400">
                        {friend.rank.name} · {friend.duel_wins}V {friend.duel_losses}D
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="max-sm:w-full shrink-0"
                    onClick={() => setChallenging(friend)}
                  >
                    Desafiar
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-semibold text-sand-500">
              Adicione amigos na aba{' '}
              <button
                onClick={() => navigate('/friends')}
                className="font-bold text-leaf-600 hover:underline"
              >
                Amigos
              </button>{' '}
              para desafiá-los diretamente.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </p>
        )}
      </Card>

      {/* History */}
      <div>
        <CardTitle>
          Seus duelos {data.awaiting_me > 0 && `· ${data.awaiting_me} esperando você`}
        </CardTitle>
        {data.items.length === 0 ? (
          <Card>
            <EmptyState
              icon="⚔️"
              title="Nenhum duelo ainda"
              description="Desafie um amigo ou enfrente um adversário aleatório para estrear."
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {data.items.map((duel) => (
              <DuelCard key={duel.id} duel={duel} onPlay={play} />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={challenging != null}
        onClose={() => setChallenging(null)}
        label="Confirmar desafio"
      >
        {challenging && (
          <>
            <span className="text-4xl" aria-hidden>
              ⚔️
            </span>
            <div>
              <p className="text-lg font-extrabold">Desafiar {challenging.name}?</p>
              <p className="text-sm font-semibold text-sand-500">@{challenging.username}</p>
            </div>
            <ul className="space-y-1 rounded-2xl bg-sand-25 p-3 text-left text-xs font-semibold text-sand-600">
              <li>• 10 perguntas de múltipla escolha, 20s cada</li>
              <li>• Os dois respondem as mesmas perguntas</li>
              <li>
                • Vitória <strong className="text-leaf-700">+50 XP</strong> · empate{' '}
                <strong className="text-grain-700">+10</strong> · derrota{' '}
                <strong className="text-red-600">−25</strong>
              </li>
              <li>• Sair no meio cancela o duelo e conta como derrota</li>
            </ul>
            <div className="flex gap-3">
              <Button variant="secondary" full onClick={() => setChallenging(null)}>
                Cancelar
              </Button>
              <Button
                full
                loading={createDuel.isPending}
                onClick={() => createDuel.mutate(challenging.username)}
              >
                Desafiar
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import type { Duel } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { formatStudyTime } from '@/lib/format'

const HEADLINE = {
  win: { title: 'Você venceu! 🏆', tone: 'text-leaf-700' },
  loss: { title: 'Dessa vez não 💪', tone: 'text-red-600' },
  draw: { title: 'Empate! 🤝', tone: 'text-grain-700' },
} as const

export function DuelResultPage() {
  const { duelId } = useParams<{ duelId: string }>()

  const { data: duel, isLoading } = useQuery({
    queryKey: ['duel', duelId],
    queryFn: () => api.get<Duel>(`/duels/${duelId}`),
    // While the rival hasn't finished, keep checking for the outcome.
    refetchInterval: (query) =>
      query.state.data?.status === 'finished' || query.state.data?.status === 'expired'
        ? false
        : 15_000,
  })

  if (isLoading || !duel) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const resolved = duel.status === 'finished'
  const headline = resolved && duel.my_result ? HEADLINE[duel.my_result] : null
  const rival = duel.rival.user

  return (
    <div className="animate-float-up mx-auto max-w-xl space-y-6">
      <h1 className={`text-center text-2xl font-extrabold ${headline?.tone ?? ''}`}>
        {headline ? headline.title : 'Rodada enviada! ⏳'}
      </h1>

      {!resolved && (
        <p className="text-center text-sm font-semibold text-sand-500">
          {rival
            ? `Aguardando @${rival.username} jogar. Avisaremos aqui assim que terminar.`
            : 'Procurando um adversário para o seu desafio.'}
        </p>
      )}

      {/* Scoreboard */}
      <Card>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-center">
            <p className="text-xs font-extrabold uppercase tracking-wide text-sand-500">Você</p>
            <motion.p
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 14 }}
              className="text-4xl font-extrabold text-leaf-600"
            >
              {duel.me.correct}
            </motion.p>
            <p className="text-xs font-semibold text-sand-500">
              {formatStudyTime(duel.me.time_seconds)}
            </p>
          </div>

          <span className="text-lg font-extrabold text-sand-300">×</span>

          <div className="text-center">
            <p className="truncate text-xs font-extrabold uppercase tracking-wide text-sand-500">
              {rival ? `@${rival.username}` : 'Rival'}
            </p>
            <p className="text-4xl font-extrabold text-sand-500">
              {duel.rival.finished ? duel.rival.correct : '—'}
            </p>
            <p className="text-xs font-semibold text-sand-500">
              {duel.rival.finished ? formatStudyTime(duel.rival.time_seconds) : 'ainda jogando'}
            </p>
          </div>
        </div>
      </Card>

      {duel.xp_change != null && (
        <Card
          className={`flex items-center justify-between ${
            duel.xp_change >= 0 ? 'bg-grain-50 ring-1 ring-grain-200' : 'bg-red-50 ring-1 ring-red-200'
          }`}
        >
          <p className="font-extrabold">
            {duel.xp_change >= 0 ? 'XP conquistado no duelo' : 'XP perdido no duelo'}
          </p>
          <span
            className={`text-xl font-extrabold ${
              duel.xp_change >= 0 ? 'text-grain-700' : 'text-red-600'
            }`}
          >
            {duel.xp_change > 0 ? `+${duel.xp_change}` : duel.xp_change} XP
          </span>
        </Card>
      )}

      <div className="flex gap-3">
        <Link to="/duels" className="flex-1">
          <Button variant="secondary" full>
            Meus duelos
          </Button>
        </Link>
        <Link to="/" className="flex-1">
          <Button full>Ver painel</Button>
        </Link>
      </div>
    </div>
  )
}

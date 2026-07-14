import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { DashboardData } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatPercent, formatRelativeDate, formatStudyTime } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthContext'
import { EvolutionChart } from './EvolutionChart'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const { stats, daily_goal, categories, recent_sessions, recommendations, reviews_due } = data
  const practicedCategories = categories.filter((c) => c.answered > 0)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="animate-float-up space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">
            {greeting}, {user?.name.split(' ')[0]} 🌾
          </h1>
          <p className="text-sm font-semibold text-sand-500">
            Recolha o seu maná de hoje — a Palavra de cada dia.
          </p>
        </div>
        <Button onClick={() => navigate('/quiz/new')}>Estudar agora</Button>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            ⚡
          </span>
          <div>
            <p className="text-xl font-extrabold">{stats.total_xp} XP</p>
            <p className="text-xs font-bold text-sand-500">Nível {stats.level}</p>
            <ProgressBar
              value={stats.xp_into_level}
              max={stats.xp_for_next_level}
              className="mt-1 h-2 w-24"
              color="bg-grain-400"
            />
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {stats.current_streak > 0 ? '🔥' : '🪵'}
          </span>
          <div>
            <p className="text-xl font-extrabold">{stats.current_streak}</p>
            <p className="text-xs font-bold text-sand-500">
              {stats.current_streak === 1 ? 'dia seguido' : 'dias seguidos'} · recorde{' '}
              {stats.longest_streak}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎯
          </span>
          <div>
            <p className="text-xl font-extrabold">{formatPercent(stats.accuracy)}</p>
            <p className="text-xs font-bold text-sand-500">
              {stats.questions_answered} respondidas
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            ⏱️
          </span>
          <div>
            <p className="text-xl font-extrabold">{formatStudyTime(stats.total_time_seconds)}</p>
            <p className="text-xs font-bold text-sand-500">tempo de estudo</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily goal */}
        <Card className="flex flex-col items-center justify-center gap-2">
          <CardTitle>Meta diária</CardTitle>
          <ProgressRing value={daily_goal.earned_today} max={daily_goal.target} size={120}>
            <div className="text-center">
              <p className="text-xl font-extrabold">{daily_goal.earned_today}</p>
              <p className="text-[10px] font-bold uppercase text-sand-500">de {daily_goal.target} XP</p>
            </div>
          </ProgressRing>
          <p className="text-sm font-bold text-sand-600">
            {daily_goal.achieved
              ? 'Meta cumprida! Maná recolhido. 🙌'
              : `Faltam ${daily_goal.target - daily_goal.earned_today} XP hoje`}
          </p>
        </Card>

        {/* Evolution chart */}
        <Card className="lg:col-span-2">
          <CardTitle>Evolução — últimos 30 dias</CardTitle>
          <EvolutionChart data={data.evolution} />
        </Card>
      </div>

      {/* Recommendations */}
      {(recommendations.length > 0 || reviews_due > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {recommendations.map((rec) => (
            <button
              key={`${rec.type}-${rec.category_slug ?? 'review'}`}
              onClick={() =>
                rec.type === 'review'
                  ? navigate('/review')
                  : navigate('/quiz/new', { state: { categorySlug: rec.category_slug } })
              }
              className="flex items-center gap-3 rounded-3xl bg-leaf-50 p-4 text-left ring-1 ring-leaf-200 transition-transform hover:scale-[1.02]"
            >
              <span className="text-2xl" aria-hidden>
                {rec.type === 'review' ? '🔁' : '💡'}
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-leaf-700">
                  {rec.type === 'review' ? 'Revisão' : 'Recomendado'}
                </p>
                <p className="text-sm font-bold text-ink">{rec.reason}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category performance */}
        <Card>
          <CardTitle>Desempenho por categoria</CardTitle>
          {practicedCategories.length === 0 ? (
            <EmptyState
              icon="🌱"
              title="Nada por aqui ainda"
              description="Complete seu primeiro quiz para ver seu desempenho por categoria."
            />
          ) : (
            <ul className="space-y-3">
              {practicedCategories.slice(0, 8).map((category) => (
                <li key={category.id} className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden>
                    {category.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="truncate">{category.name}</span>
                      <span className="text-sand-500">{formatPercent(category.accuracy)}</span>
                    </div>
                    <ProgressBar
                      value={Math.round((category.accuracy ?? 0) * 100)}
                      max={100}
                      className="mt-1 h-2"
                      color={(category.accuracy ?? 0) >= 0.8 ? 'bg-leaf-500' : 'bg-grain-400'}
                    />
                  </div>
                  <span className="text-xs font-bold text-sand-400">{category.answered}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent sessions */}
        <Card>
          <CardTitle>Últimos quizzes</CardTitle>
          {recent_sessions.length === 0 ? (
            <EmptyState
              icon="📖"
              title="Seu primeiro quiz espera por você"
              action={<Link to="/quiz/new" className="font-bold text-leaf-600 hover:underline">Começar agora</Link>}
            />
          ) : (
            <ul className="divide-y divide-sand-100">
              {recent_sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-lg" aria-hidden>
                      {session.mode === 'review' ? '🔁' : '📖'}
                    </span>
                    <div>
                      <p className="font-extrabold">
                        {session.correct_count}/{session.question_count} corretas
                      </p>
                      <p className="text-xs font-semibold text-sand-500">
                        {session.completed_at ? formatRelativeDate(session.completed_at) : ''}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-grain-100 px-3 py-1 text-xs font-extrabold text-grain-700">
                    +{session.xp_earned} XP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

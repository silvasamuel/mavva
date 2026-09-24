import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type {
  QuizSession,
  ReviewOrder,
  ReviewScope,
  ReviewSpacing,
  ReviewSummary,
  User,
} from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { AppIcons, Glyph } from '@/lib/icons'
import { useAuth } from '@/features/auth/AuthContext'

const SPACING: { value: ReviewSpacing; label: string; hint: string }[] = [
  { value: 'intensive', label: 'Intensivo', hint: '1 dia, depois 2' },
  { value: 'balanced', label: 'Equilibrado', hint: '1 dia, depois 3' },
  { value: 'relaxed', label: 'Leve', hint: '3 dias, depois 7' },
]

const SIZES = [5, 10, 15, 20]

const SCOPES: { value: ReviewScope; label: string }[] = [
  { value: 'all', label: 'Tudo que eu respondo' },
  { value: 'mistakes', label: 'Só o que eu erro' },
]

const ORDERS: { value: ReviewOrder; label: string }[] = [
  { value: 'oldest', label: 'Mais atrasadas' },
  { value: 'lapses', label: 'Mais erradas' },
]

const CAPS: { value: number | null; label: string }[] = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '1 ano' },
  { value: null, label: 'Sem limite' },
]

interface ReviewPrefs {
  review_spacing: ReviewSpacing
  review_scope: ReviewScope
  review_order: ReviewOrder
  review_session_size: number
  review_max_interval_days: number | null
}

function prefsFrom(user: User): ReviewPrefs {
  return {
    review_spacing: user.review_spacing,
    review_scope: user.review_scope,
    review_order: user.review_order,
    review_session_size: user.review_session_size,
    review_max_interval_days: user.review_max_interval_days,
  }
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-colors ${
        selected
          ? 'bg-leaf-500 text-white shadow-card'
          : 'bg-white text-sand-600 shadow-card hover:bg-sand-50'
      }`}
    >
      {children}
    </button>
  )
}

export function ReviewPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [error, setError] = useState('')
  const [prefs, setPrefs] = useState<ReviewPrefs>(() => prefsFrom(user!))
  const { data, isLoading } = useQuery({
    queryKey: ['reviews', 'summary'],
    queryFn: () => api.get<ReviewSummary>('/reviews/summary'),
  })

  const save = useMutation({
    mutationFn: (next: ReviewPrefs) => api.patch<User>('/users/me', next),
    onSuccess: (updated) => {
      updateUser(updated)
      setError('')
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a revisão.'),
  })

  const startReview = useMutation({
    mutationFn: () =>
      api.post<QuizSession>('/quizzes', {
        mode: 'review',
        question_count: prefs.review_session_size,
      }),
    onSuccess: (session) => navigate(`/quiz/${session.id}`),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível iniciar a revisão.'),
  })

  function update(next: ReviewPrefs) {
    setPrefs(next)
    setError('')
    save.mutate(next)
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const batch = Math.min(data.due_today, prefs.review_session_size)

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Revisão inteligente</h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-3xl font-extrabold text-leaf-600">{data.due_today}</p>
          <p className="text-xs font-bold uppercase text-sand-500">para hoje</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-extrabold">{data.due_this_week}</p>
          <p className="text-xs font-bold uppercase text-sand-500">nesta semana</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-extrabold">{data.total_items}</p>
          <p className="text-xs font-bold uppercase text-sand-500">acompanhadas</p>
        </Card>
      </div>

      <Card className="space-y-5">
        <div>
          <CardTitle>Espaçamento</CardTitle>
          <div className="flex flex-wrap gap-2">
            {SPACING.map((option) => (
              <Chip
                key={option.value}
                selected={prefs.review_spacing === option.value}
                onClick={() => update({ ...prefs, review_spacing: option.value })}
              >
                {option.label}
                <span className="font-semibold opacity-80">{option.hint}</span>
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <CardTitle>Por sessão</CardTitle>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((size) => (
              <Chip
                key={size}
                selected={prefs.review_session_size === size}
                onClick={() => update({ ...prefs, review_session_size: size })}
              >
                {size}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <CardTitle>O que entra</CardTitle>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((option) => (
              <Chip
                key={option.value}
                selected={prefs.review_scope === option.value}
                onClick={() => update({ ...prefs, review_scope: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <CardTitle>Ordem</CardTitle>
          <div className="flex flex-wrap gap-2">
            {ORDERS.map((option) => (
              <Chip
                key={option.value}
                selected={prefs.review_order === option.value}
                onClick={() => update({ ...prefs, review_order: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <CardTitle>Intervalo máximo</CardTitle>
          <div className="flex flex-wrap gap-2">
            {CAPS.map((option) => (
              <Chip
                key={option.label}
                selected={prefs.review_max_interval_days === option.value}
                onClick={() => update({ ...prefs, review_max_interval_days: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {data.due_today > 0 ? (
        <Button
          full
          className="py-4 text-base"
          loading={startReview.isPending}
          disabled={save.isPending}
          onClick={() => startReview.mutate()}
        >
          Revisar {batch} {batch === 1 ? 'pergunta' : 'perguntas'}
        </Button>
      ) : (
        <Card>
          <EmptyState
            icon={<Glyph as={AppIcons.sun} className="h-10 w-10" />}
            title="Tudo revisado por hoje!"
            description={
              data.total_items === 0
                ? prefs.review_scope === 'mistakes'
                  ? 'Responda quizzes. O que você errar entra no ciclo de revisão.'
                  : 'Responda quizzes e as perguntas entram no ciclo de revisão.'
                : 'Volte amanhã — a constância é o segredo da retenção.'
            }
            action={
              <Button variant="secondary" onClick={() => navigate('/quiz/new')}>
                Estudar algo novo
              </Button>
            }
          />
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

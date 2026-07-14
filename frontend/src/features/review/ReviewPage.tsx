import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { QuizSession, ReviewSummary } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useState } from 'react'

export function ReviewPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['reviews', 'summary'],
    queryFn: () => api.get<ReviewSummary>('/reviews/summary'),
  })

  const startReview = useMutation({
    mutationFn: () => api.post<QuizSession>('/quizzes', { mode: 'review', question_count: 10 }),
    onSuccess: (session) => navigate(`/quiz/${session.id}`),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível iniciar a revisão.'),
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Revisão inteligente</h1>
        <p className="text-sm font-semibold text-sand-500">
          Repetição espaçada: cada pergunta volta na hora certa para fixar de verdade.
        </p>
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

      {data.due_today > 0 ? (
        <Button full className="py-4 text-base" loading={startReview.isPending} onClick={() => startReview.mutate()}>
          Revisar {Math.min(data.due_today, 10)} {data.due_today === 1 ? 'pergunta' : 'perguntas'}
        </Button>
      ) : (
        <Card>
          <EmptyState
            icon="🌤️"
            title="Tudo revisado por hoje!"
            description={
              data.total_items === 0
                ? 'Responda quizzes e as perguntas entrarão automaticamente no ciclo de revisão.'
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

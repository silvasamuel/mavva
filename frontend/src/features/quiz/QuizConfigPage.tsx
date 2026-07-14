import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { Category, Difficulty, QuizSession, Testament } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { DIFFICULTY_LABELS } from '@/lib/format'

const TESTAMENT_OPTIONS: { value: Testament | null; label: string; icon: string }[] = [
  { value: null, label: 'Bíblia inteira', icon: '📖' },
  { value: 'old', label: 'Antigo Testamento', icon: '📜' },
  { value: 'new', label: 'Novo Testamento', icon: '✝️' },
]

const DIFFICULTY_OPTIONS: (Difficulty | null)[] = [null, 'easy', 'medium', 'hard', 'expert']
const COUNT_OPTIONS = [5, 10, 15, 20]
const TIMER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Sem tempo' },
  { value: 15, label: '⏱️ 15s' },
  { value: 30, label: '⏱️ 30s' },
]

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
      className={`rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-colors ${
        selected
          ? 'bg-leaf-500 text-white shadow-card'
          : 'bg-white text-sand-600 shadow-card hover:bg-sand-50'
      }`}
    >
      {children}
    </button>
  )
}

export function QuizConfigPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const preselectedSlug = (location.state as { categorySlug?: string } | null)?.categorySlug

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  })

  const [testament, setTestament] = useState<Testament | null>(null)
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [questionCount, setQuestionCount] = useState(10)
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null)
  const [error, setError] = useState('')

  // Apply the recommendation's category once, when categories arrive.
  useEffect(() => {
    if (!preselectedSlug || !categories) return
    const match = categories.find((category) => category.slug === preselectedSlug)
    if (match) setCategoryIds([match.id])
    // Clear the history state so a reload starts clean.
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  function toggleCategory(id: number) {
    setError('')
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    )
  }

  const startQuiz = useMutation({
    mutationFn: () =>
      api.post<QuizSession>('/quizzes', {
        mode: 'practice',
        question_count: questionCount,
        testament,
        category_ids: categoryIds.length > 0 ? categoryIds : null,
        difficulty,
        timer_seconds: timerSeconds,
      }),
    onSuccess: (session) => navigate(`/quiz/${session.id}`),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o quiz.'),
  })

  return (
    <div className="animate-float-up mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Montar estudo</h1>
        <p className="text-sm font-semibold text-sand-500">
          Escolha o recorte e receba perguntas com explicação e referência.
        </p>
      </header>

      <Card>
        <CardTitle>Testamento</CardTitle>
        <div className="flex flex-wrap gap-2">
          {TESTAMENT_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              selected={testament === option.value}
              onClick={() => {
                setError('')
                setTestament(option.value)
              }}
            >
              <span aria-hidden>{option.icon}</span> {option.label}
            </Chip>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Categorias</CardTitle>
        <p className="mb-3 -mt-2 text-xs font-semibold text-sand-500">
          Combine quantas quiser — vazio significa todas.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={categoryIds.length === 0}
            onClick={() => {
              setError('')
              setCategoryIds([])
            }}
          >
            Todas
          </Chip>
          {(categories ?? []).map((category) => (
            <Chip
              key={category.id}
              selected={categoryIds.includes(category.id)}
              onClick={() => toggleCategory(category.id)}
            >
              <span aria-hidden>{category.icon}</span> {category.name}
            </Chip>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Dificuldade</CardTitle>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_OPTIONS.map((option) => (
              <Chip
                key={option ?? 'all'}
                selected={difficulty === option}
                onClick={() => {
                  setError('')
                  setDifficulty(option)
                }}
              >
                {option ? DIFFICULTY_LABELS[option] : 'Todas'}
              </Chip>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Perguntas</CardTitle>
          <div className="flex flex-wrap gap-2">
            {COUNT_OPTIONS.map((count) => (
              <Chip
                key={count}
                selected={questionCount === count}
                onClick={() => setQuestionCount(count)}
              >
                {count}
              </Chip>
            ))}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardTitle>Tempo por pergunta</CardTitle>
          <p className="mb-3 -mt-2 text-xs font-semibold text-sand-500">
            O tempo corre só enquanto você responde — a explicação pode ser lida com calma.
            Estourou o tempo, conta como erro.
          </p>
          <div className="flex flex-wrap gap-2">
            {TIMER_OPTIONS.map((option) => (
              <Chip
                key={option.label}
                selected={timerSeconds === option.value}
                onClick={() => setTimerSeconds(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <Button
        full
        loading={startQuiz.isPending}
        onClick={() => startQuiz.mutate()}
        className="py-4 text-base"
      >
        Começar quiz
      </Button>
    </div>
  )
}

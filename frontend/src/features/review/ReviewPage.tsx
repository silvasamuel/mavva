import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { InfoTip } from '@/components/ui/InfoTip'
import { Spinner } from '@/components/ui/Spinner'
import { formatDays } from '@/lib/format'
import { AppIcons, Glyph } from '@/lib/icons'
import { useAuth } from '@/features/auth/AuthContext'

const SPACING: { value: ReviewSpacing; label: string }[] = [
  { value: 'intensive', label: 'Intensivo' },
  { value: 'balanced', label: 'Equilibrado' },
  { value: 'relaxed', label: 'Leve' },
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
  children: ReactNode
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

function SectionTitle({
  children,
  tip,
  tipLabel,
}: {
  children: ReactNode
  tip: ReactNode
  tipLabel: string
}) {
  return <CardTitle aside={<InfoTip label={tipLabel}>{tip}</InfoTip>}>{children}</CardTitle>
}

function Counter({
  value,
  label,
  tip,
  tipLabel,
  highlight = false,
  busy,
}: {
  value: number
  label: string
  tip: ReactNode
  tipLabel: string
  highlight?: boolean
  busy: boolean
}) {
  // Three of these share a phone's width (~100px each at 360px): less side
  // padding, the number starts below the "i", and a long label hyphenates
  // ("acompa-nhadas") instead of spilling out of the card.
  return (
    <Card className="relative px-2 pb-4 pt-7 text-center sm:p-5">
      <span className="absolute right-2 top-2">
        <InfoTip label={tipLabel}>{tip}</InfoTip>
      </span>
      <p
        aria-busy={busy}
        className={`text-3xl font-extrabold transition-opacity ${highlight ? 'text-leaf-600' : ''} ${
          busy ? 'opacity-40' : ''
        }`}
      >
        {value}
      </p>
      <p className="hyphens-auto break-words text-xs font-bold uppercase text-sand-500">{label}</p>
    </Card>
  )
}

function SpacingTimeline({ steps, cap }: { steps: number[]; cap: number | null }) {
  return (
    <div className="mt-3 rounded-2xl bg-sand-50 px-4 py-3">
      <p className="text-sm font-bold text-sand-700">Acertou? Ela volta em</p>
      <ol
        aria-label="Intervalo até a pergunta voltar, a cada acerto seguido"
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        {steps.map((days, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-sand-400">
                →
              </span>
            )}
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-leaf-700 shadow-card">
              {formatDays(days)}
            </span>
          </li>
        ))}
        <li aria-hidden className="font-extrabold text-sand-400">
          …
        </li>
      </ol>
      <p className="mt-2 text-xs font-semibold text-sand-500">
        Errou? Volta amanhã e o intervalo recomeça.
        {cap != null && ` Nenhum intervalo passa de ${formatDays(cap)}.`} Vale a partir da próxima
        vez que você responder cada pergunta.
      </p>
    </div>
  )
}

export function ReviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, updateUser } = useAuth()
  const [error, setError] = useState('')
  const [prefs, setPrefs] = useState<ReviewPrefs>(() => prefsFrom(user!))
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reviews', 'summary'],
    queryFn: () => api.get<ReviewSummary>('/reviews/summary'),
  })

  const save = useMutation({
    mutationFn: (next: ReviewPrefs) => api.patch<User>('/users/me', next),
    onSuccess: (updated) => {
      updateUser(updated)
      setError('')
      // "O que entra" and "Intervalo máximo" change what's due right away, and
      // the dashboard badge counts the same deck — refresh both.
      queryClient.invalidateQueries({ queryKey: ['reviews', 'summary'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
  const updating = isFetching || save.isPending

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Revisão inteligente</h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Counter
          value={data.due_today}
          label="para hoje"
          highlight
          busy={updating}
          tipLabel="O que conta em para hoje"
          tip={
            <>
              Perguntas que já venceram: as de hoje e as atrasadas. Cada revisão traz até{' '}
              {prefs.review_session_size}; o resto espera a próxima sessão.
            </>
          }
        />
        <Counter
          value={data.due_this_week}
          label="nesta semana"
          busy={updating}
          tipLabel="O que conta em nesta semana"
          tip="Tudo que vence de hoje até daqui a 6 dias, incluindo as de hoje e as atrasadas."
        />
        <Counter
          value={data.total_items}
          label="acompanhadas"
          busy={updating}
          tipLabel="O que conta em acompanhadas"
          tip={
            prefs.review_scope === 'mistakes'
              ? 'Perguntas no seu ciclo de revisão. Com “Só o que eu erro”, contam só as que você já errou alguma vez.'
              : 'Todas as perguntas no seu ciclo de revisão — cada uma que você respondeu.'
          }
        />
      </div>

      <Card className="space-y-5">
        <div>
          <SectionTitle
            tipLabel="Como funciona o espaçamento"
            tip={
              <>
                Revisão espaçada: cada acerto aumenta o tempo até a pergunta voltar, e um erro faz ela
                voltar amanhã, com o intervalo recomeçando. Assim você revisa pouco o que já domina e
                muito o que ainda não fixou — sempre perto da hora em que ia esquecer.
              </>
            }
          >
            Espaçamento
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {SPACING.map((option) => {
              const [first, second] = data.spacing_preview[option.value]
              return (
                <Chip
                  key={option.value}
                  selected={prefs.review_spacing === option.value}
                  onClick={() => update({ ...prefs, review_spacing: option.value })}
                >
                  {option.label}
                  <span className="font-semibold opacity-80">
                    {formatDays(first)}, depois {second}
                  </span>
                </Chip>
              )
            })}
          </div>
          <SpacingTimeline
            steps={data.spacing_preview[prefs.review_spacing]}
            cap={prefs.review_max_interval_days}
          />
        </div>

        <div>
          <SectionTitle
            tipLabel="O que é por sessão"
            tip="Quantas perguntas cada revisão traz. Se vencerem mais que isso, o resto fica para a próxima sessão — nada se perde."
          >
            Por sessão
          </SectionTitle>
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
          <SectionTitle
            tipLabel="O que entra na revisão"
            tip={
              <>
                <strong>Tudo que eu respondo:</strong> toda pergunta respondida entra no ciclo.{' '}
                <strong>Só o que eu erro:</strong> ficam só as que você já errou — as outras continuam
                guardadas e voltam se você trocar de novo. Muda as contagens na hora.
              </>
            }
          >
            O que entra
          </SectionTitle>
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
          <SectionTitle
            tipLabel="Como funciona a ordem"
            tip="Qual pergunta vem primeiro quando vencem mais do que cabem numa sessão: as que venceram há mais tempo, ou as que você mais errou."
          >
            Ordem
          </SectionTitle>
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
          <SectionTitle
            tipLabel="O que é o intervalo máximo"
            tip="O tempo máximo que uma pergunta fica sem voltar, contado da última revisão. Vale na hora: perguntas agendadas para depois disso passam a vencer dentro do limite."
          >
            Intervalo máximo
          </SectionTitle>
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
          disabled={updating}
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

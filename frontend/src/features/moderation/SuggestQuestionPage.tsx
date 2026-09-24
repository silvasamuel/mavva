import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type {
  AppSuggestionKind,
  BibleBook,
  Category,
  ProposalCreateResponse,
  QuestionDraft,
  SuggestionCreateResponse,
} from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { QuestionDraftForm } from './QuestionDraftForm'
import { emptyDraft, toApiDraft, validateDraft } from './questionDraft'
import { AppIcons, Glyph, type Icon } from '@/lib/icons'

type SuggestionKind = 'question' | AppSuggestionKind

const CHOICES: { kind: SuggestionKind; title: string; description: string; icon: Icon }[] = [
  {
    kind: 'question',
    title: 'Pergunta',
    description: 'Uma questão nova para o banco, depois da revisão.',
    icon: AppIcons.suggest,
  },
  {
    kind: 'feature',
    title: 'Nova funcionalidade',
    description: 'Uma ideia do que o Mavva ainda não faz.',
    icon: AppIcons.sparkle,
  },
  {
    kind: 'correction',
    title: 'Correção',
    description: 'Algo errado ou quebrado no aplicativo.',
    icon: AppIcons.warning,
  },
]

const FIELD =
  'w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500 focus-visible:ring-0'

export function SuggestQuestionPage() {
  const [kind, setKind] = useState<SuggestionKind | null>(null)
  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
    enabled: kind === 'question',
  })
  const { data: books, isLoading: booksLoading } = useQuery({
    queryKey: ['books'],
    queryFn: () => api.get<BibleBook[]>('/books'),
    enabled: kind === 'question',
  })

  const initial = useMemo(() => {
    if (!categories?.length || !books?.length) return null
    return emptyDraft(categories[0].id, books[0].slug)
  }, [categories, books])

  const form = draft ?? initial
  const choice = CHOICES.find((item) => item.kind === kind)

  const submitQuestion = useMutation({
    mutationFn: (payload: QuestionDraft) =>
      api.post<ProposalCreateResponse>('/proposals', payload),
    onSuccess: () => {
      setDone(true)
      setError('')
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a sugestão.'),
  })

  const submitNote = useMutation({
    mutationFn: (payload: { kind: AppSuggestionKind; body: string }) =>
      api.post<SuggestionCreateResponse>('/suggestions', payload),
    onSuccess: () => {
      setDone(true)
      setError('')
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a sugestão.'),
  })

  function choose(next: SuggestionKind) {
    setKind(next)
    setError('')
    setDone(false)
  }

  function back() {
    setKind(null)
    setError('')
    setDone(false)
  }

  function startOver() {
    if (categories?.length && books?.length) {
      setDraft(emptyDraft(categories[0].id, books[0].slug))
    } else {
      setDraft(null)
    }
    setNote('')
    setError('')
    setDone(false)
    setKind(null)
  }

  function handleQuestionSubmit() {
    if (!form) return
    const message = validateDraft(form)
    if (message) {
      setError(message)
      return
    }
    setError('')
    submitQuestion.mutate(toApiDraft(form))
  }

  function handleNoteSubmit() {
    if (kind !== 'feature' && kind !== 'correction') return
    const body = note.trim()
    if (body.length < 10) {
      setError('Escreva pelo menos 10 caracteres.')
      return
    }
    setError('')
    submitNote.mutate({ kind, body })
  }

  if (kind === null || !choice) {
    return (
      <div className="animate-float-up mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-extrabold">Sugerir</h1>
          <p className="text-sm font-semibold text-sand-500">Escolha o que você quer enviar.</p>
        </header>
        <div className="space-y-3">
          {CHOICES.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => choose(item.kind)}
              className="flex w-full items-center gap-4 rounded-3xl bg-white/80 p-5 text-left shadow-card transition-colors hover:bg-white"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-600">
                <Glyph as={item.icon} className="h-7 w-7" />
              </span>
              <span>
                <span className="block font-extrabold text-ink">{item.title}</span>
                <span className="block text-sm font-semibold text-sand-500">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (done) {
    const isQuestion = kind === 'question'
    return (
      <div className="animate-float-up mx-auto max-w-xl space-y-4 py-10 text-center">
        <span className="mx-auto flex justify-center text-leaf-600">
          <Glyph as={AppIcons.plant} className="h-12 w-12" />
        </span>
        <h1 className="text-2xl font-extrabold">Sugestão enviada</h1>
        <p className="text-sm font-semibold text-sand-500">
          {isQuestion
            ? 'Ela entra na fila de revisão e só aparece nos quizzes depois de aprovada. Você pode ter até 5 sugestões de pergunta aguardando ao mesmo tempo.'
            : 'Ela entra na fila de revisão. Você pode ter até 5 sugestões de melhoria aguardando ao mesmo tempo.'}
        </p>
        <Button onClick={startOver}>Enviar outra</Button>
      </div>
    )
  }

  const questionLoading = kind === 'question' && (categoriesLoading || booksLoading || !form)

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <button
          type="button"
          onClick={back}
          className="text-sm font-extrabold text-leaf-700 hover:text-leaf-600"
        >
          Voltar
        </button>
        <h1 className="text-2xl font-extrabold">{choice.title}</h1>
        <p className="text-sm font-semibold text-sand-500">{choice.description}</p>
      </header>

      {questionLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : kind === 'question' && form && categories && books ? (
        <Card>
          <QuestionDraftForm
            draft={form}
            onChange={setDraft}
            categories={categories}
            books={books}
          />
        </Card>
      ) : (
        <Card>
          <label className="block space-y-1.5">
            <span className="block text-sm font-bold text-sand-700">Sugestão</span>
            <textarea
              value={note}
              rows={6}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                kind === 'feature'
                  ? 'Conte a funcionalidade que você gostaria de ver.'
                  : 'Conte o que precisa ser corrigido.'
              }
              className={FIELD}
            />
          </label>
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      {!questionLoading && (
        <Button
          full
          loading={submitQuestion.isPending || submitNote.isPending}
          onClick={kind === 'question' ? handleQuestionSubmit : handleNoteSubmit}
        >
          Enviar sugestão
        </Button>
      )}
    </div>
  )
}

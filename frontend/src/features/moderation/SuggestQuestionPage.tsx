import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { BibleBook, Category, ProposalCreateResponse, QuestionDraft } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { QuestionDraftForm } from './QuestionDraftForm'
import { emptyDraft, toApiDraft, validateDraft } from './questionDraft'

export function SuggestQuestionPage() {
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  })
  const { data: books } = useQuery({
    queryKey: ['books'],
    queryFn: () => api.get<BibleBook[]>('/books'),
  })

  const initial = useMemo(() => {
    if (!categories?.length || !books?.length) return null
    return emptyDraft(categories[0].id, books[0].slug)
  }, [categories, books])

  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const form = draft ?? initial

  const submit = useMutation({
    mutationFn: (payload: QuestionDraft) =>
      api.post<ProposalCreateResponse>('/proposals', payload),
    onSuccess: () => {
      setDone(true)
      setError('')
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a sugestão.'),
  })

  function handleSubmit() {
    if (!form) return
    const message = validateDraft(form)
    if (message) {
      setError(message)
      return
    }
    setError('')
    submit.mutate(toApiDraft(form))
  }

  if (!categories || !books || !form) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="animate-float-up mx-auto max-w-xl space-y-4 py-10 text-center">
        <p className="text-4xl" aria-hidden>
          🌱
        </p>
        <h1 className="text-2xl font-extrabold">Sugestão enviada</h1>
        <p className="text-sm font-semibold text-sand-500">
          Ela entra na fila de revisão e só aparece nos quizzes depois de aprovada. Você pode ter
          até 5 sugestões aguardando ao mesmo tempo.
        </p>
        <Button
          onClick={() => {
            setDraft(emptyDraft(categories[0].id, books[0].slug))
            setDone(false)
          }}
        >
          Enviar outra
        </Button>
      </div>
    )
  }

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Sugerir pergunta</h1>
        <p className="text-sm font-semibold text-sand-500">
          Mesmo formato do banco: enunciado, alternativas ou resposta aberta, explicação e
          referência. A sugestão fica inativa até um revisor aprovar.
        </p>
      </header>

      <Card>
        <QuestionDraftForm
          draft={form}
          onChange={setDraft}
          categories={categories}
          books={books}
        />
      </Card>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <Button full loading={submit.isPending} onClick={handleSubmit}>
        Enviar sugestão
      </Button>
    </div>
  )
}

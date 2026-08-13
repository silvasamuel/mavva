import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { BibleBook } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { FLAG_REASON_LABELS, formatRelativeDate } from '@/lib/format'
import { QuestionDraftForm } from '@/features/moderation/QuestionDraftForm'
import {
  draftFromPayload,
  emptyDraft,
  toApiDraft,
  validateDraft,
} from '@/features/moderation/questionDraft'
import { QuestionEditor } from './QuestionEditor'
import type {
  AdminCategory,
  AdminFlag,
  AdminProposal,
  AdminReviewInbox,
} from './types'

export function ReviewPanel() {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [correcting, setCorrecting] = useState<AdminFlag | null>(null)
  const [editing, setEditing] = useState<AdminProposal | null>(null)

  const { data: inbox, isLoading } = useQuery({
    queryKey: ['admin', 'review'],
    queryFn: () => api.get<AdminReviewInbox>('/admin/review'),
  })
  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get<AdminCategory[]>('/admin/categories'),
  })
  const { data: books } = useQuery({
    queryKey: ['books'],
    queryFn: () => api.get<BibleBook[]>('/books'),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'review'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'content'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
  }

  const flagAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resolve' | 'dismiss' | 'deactivate' }) =>
      api.post<void>(`/admin/review/flags/${id}/${action}`),
    onSuccess: refresh,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o report.'),
  })

  const reject = useMutation({
    mutationFn: (id: string) => api.post<void>(`/admin/review/proposals/${id}/reject`),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível recusar a sugestão.'),
  })

  if (isLoading || !inbox) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-leaf-500" />
      </div>
    )
  }

  const empty = inbox.flags.length === 0 && inbox.proposals.length === 0

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      {empty && (
        <EmptyState
          icon="✅"
          title="Fila vazia"
          description="Nenhum report aberto nem sugestão pendente."
        />
      )}

      {inbox.flags.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-sand-600">
            Reports ({inbox.open_flags})
          </h2>
          {inbox.flags.map((flag) => (
            <Card key={flag.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-ink">{flag.question_text}</p>
                  <p className="text-xs font-semibold text-sand-400">
                    {flag.question_external_id}
                    {!flag.question_active && ' · inativa'}
                  </p>
                </div>
                <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-extrabold text-sand-600">
                  {FLAG_REASON_LABELS[flag.reason]}
                </span>
              </div>
              {flag.comment && (
                <p className="rounded-2xl bg-sand-50 px-3 py-2 text-sm font-semibold text-sand-700">
                  “{flag.comment}”
                </p>
              )}
              <p className="text-xs font-semibold text-sand-400">
                @{flag.reporter_username} · {formatRelativeDate(flag.created_at)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCorrecting(flag)}>Corrigir</Button>
                <Button
                  variant="secondary"
                  loading={flagAction.isPending}
                  onClick={() => flagAction.mutate({ id: flag.id, action: 'deactivate' })}
                >
                  Retirar do jogo
                </Button>
                <Button
                  variant="ghost"
                  loading={flagAction.isPending}
                  onClick={() => flagAction.mutate({ id: flag.id, action: 'dismiss' })}
                >
                  Dispensar
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      {inbox.proposals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-sand-600">
            Sugestões ({inbox.pending_proposals})
          </h2>
          {inbox.proposals.map((proposal) => (
            <Card key={proposal.id} className="space-y-3">
              <p className="font-extrabold text-ink">{proposal.payload.text}</p>
              <p className="text-xs font-semibold text-sand-400">
                @{proposal.author_username} · {formatRelativeDate(proposal.created_at)} ·{' '}
                {proposal.payload.type === 'multiple_choice' ? 'Múltipla escolha' : 'Resposta aberta'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setEditing(proposal)}>Editar e aprovar</Button>
                <Button
                  variant="ghost"
                  loading={reject.isPending}
                  onClick={() => reject.mutate(proposal.id)}
                >
                  Recusar
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      {correcting && (
        <QuestionEditor
          questionId={correcting.question_id}
          categories={categories ?? []}
          onClose={() => setCorrecting(null)}
          onSaved={() => flagAction.mutate({ id: correcting.id, action: 'resolve' })}
        />
      )}

      {editing && books && (
        <ProposalEditor
          proposal={editing}
          categories={categories ?? []}
          books={books}
          onClose={() => setEditing(null)}
          onApproved={refresh}
          onError={setError}
        />
      )}
    </div>
  )
}

function ProposalEditor({
  proposal,
  categories,
  books,
  onClose,
  onApproved,
  onError,
}: {
  proposal: AdminProposal
  categories: AdminCategory[]
  books: BibleBook[]
  onClose: () => void
  onApproved: () => void
  onError: (message: string) => void
}) {
  const fallback = emptyDraft(categories[0]?.id ?? proposal.payload.category_id, books[0]?.slug ?? 'genesis')
  const [draft, setDraft] = useState(() => draftFromPayload(proposal.payload, fallback))
  const [localError, setLocalError] = useState('')

  const approve = useMutation({
    mutationFn: () => api.post(`/admin/review/proposals/${proposal.id}/approve`, toApiDraft(draft)),
    onSuccess: () => {
      onApproved()
      onClose()
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Não foi possível aprovar.'
      setLocalError(message)
      onError(message)
    },
  })

  function handleApprove() {
    const message = validateDraft(draft)
    if (message) {
      setLocalError(message)
      return
    }
    setLocalError('')
    approve.mutate()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-label="Editar e aprovar sugestão"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-sand-50 p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Editar e aprovar</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-2xl text-sand-400 hover:text-sand-600"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs font-semibold text-sand-400">
          Enviada por @{proposal.author_username}. A pergunta entra ativa no banco ao aprovar.
        </p>
        <QuestionDraftForm
          draft={draft}
          onChange={setDraft}
          categories={categories}
          books={books}
        />
        {localError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {localError}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" full onClick={onClose}>
            Cancelar
          </Button>
          <Button full loading={approve.isPending} onClick={handleApprove}>
            Aprovar
          </Button>
        </div>
      </div>
    </div>
  )
}

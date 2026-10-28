import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { AnnouncementKind } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/format'
import { Glyph } from '@/lib/icons'
import { ANNOUNCEMENT_KIND_ORDER, ANNOUNCEMENT_KINDS } from '@/features/notifications/kinds'
import type { AdminAnnouncement } from './types'

const FIELD =
  'w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500 focus-visible:ring-0'
const TITLE_MAX = 120
const BODY_MAX = 2000

interface Draft {
  title: string
  body: string
  kind: AnnouncementKind
}

const EMPTY: Draft = { title: '', body: '', kind: 'feature' }
const KEY = ['admin', 'announcements']

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Não foi possível salvar.'
}

/**
 * "Novidades" for players: write, keep as a draft, publish, edit, unpublish or
 * delete. Publishing stamps the date once, so fixing a typo later doesn't make
 * it unread again for everyone.
 */
export function AnnouncementsPanel() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const { data, isPending } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<AdminAnnouncement[]>('/admin/announcements'),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY })

  const save = useMutation({
    mutationFn: ({ publish }: { publish?: boolean }) => {
      const body = { ...draft, ...(publish === undefined ? {} : { published: publish }) }
      return editingId
        ? api.patch<AdminAnnouncement>(`/admin/announcements/${editingId}`, body)
        : api.post<AdminAnnouncement>('/admin/announcements', body)
    },
    onSuccess: (saved) => {
      setMessage(saved.published_at ? 'Publicada para todos os jogadores.' : 'Rascunho salvo.')
      setDraft(EMPTY)
      setEditingId(null)
      void refresh()
    },
    onError: (error) => setMessage(errorText(error)),
  })

  const toggle = useMutation({
    mutationFn: (item: AdminAnnouncement) =>
      api.patch<AdminAnnouncement>(`/admin/announcements/${item.id}`, {
        published: item.published_at == null,
      }),
    onSuccess: () => void refresh(),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/announcements/${id}`),
    onSuccess: () => void refresh(),
  })

  function edit(item: AdminAnnouncement) {
    setEditingId(item.id)
    setDraft({ title: item.title, body: item.body, kind: item.kind })
    setMessage('')
  }

  const ready = draft.title.trim() !== '' && draft.body.trim() !== ''

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="h-fit space-y-4">
        <CardTitle>{editingId ? 'Editar novidade' : 'Nova novidade'}</CardTitle>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-sand-700">Tipo</span>
          <select
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as AnnouncementKind })}
            className={FIELD}
          >
            {ANNOUNCEMENT_KIND_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {ANNOUNCEMENT_KINDS[kind].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-sand-700">Título</span>
          <input
            value={draft.title}
            maxLength={TITLE_MAX}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="Duelos em trio chegaram"
            className={FIELD}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex justify-between text-sm font-bold text-sand-700">
            Texto
            <span className="text-xs font-semibold text-sand-400">
              {draft.body.length}/{BODY_MAX}
            </span>
          </span>
          <textarea
            value={draft.body}
            rows={6}
            maxLength={BODY_MAX}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            placeholder="Conte o que mudou e por que é bom para o jogador."
            className={FIELD}
          />
        </label>
        {message && <p className="text-sm font-bold text-leaf-700">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready} loading={save.isPending} onClick={() => save.mutate({ publish: true })}>
            {editingId ? 'Salvar e publicar' : 'Publicar'}
          </Button>
          <Button
            variant="secondary"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate({ publish: editingId ? undefined : false })}
          >
            {editingId ? 'Salvar sem mudar o status' : 'Salvar rascunho'}
          </Button>
          {editingId && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null)
                setDraft(EMPTY)
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Publicadas e rascunhos</CardTitle>
        {isPending ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-leaf-500" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm font-semibold text-sand-400">Nenhuma novidade ainda.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {data.map((item) => {
              const kind = ANNOUNCEMENT_KINDS[item.kind]
              const published = item.published_at != null
              return (
                <li key={item.id} className="flex gap-3 py-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kind.tile}`}
                    aria-hidden
                  >
                    <Glyph as={kind.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                          published ? 'bg-leaf-100 text-leaf-800' : 'bg-sand-100 text-sand-600'
                        }`}
                      >
                        {published ? 'Publicada' : 'Rascunho'}
                      </span>
                      <span className="text-xs font-semibold text-sand-400">
                        {published ? formatDateTime(item.published_at) : `criada ${formatDateTime(item.created_at)}`}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-extrabold text-ink">{item.title}</p>
                    <p className="line-clamp-2 whitespace-pre-line text-sm font-semibold text-sand-500">
                      {item.body}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-extrabold">
                      <button type="button" className="text-leaf-700 hover:underline" onClick={() => edit(item)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-sand-600 hover:underline"
                        onClick={() => toggle.mutate(item)}
                      >
                        {published ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm(`Apagar "${item.title}"? Isso não pode ser desfeito.`)) {
                            remove.mutate(item.id)
                          }
                        }}
                      >
                        Apagar
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

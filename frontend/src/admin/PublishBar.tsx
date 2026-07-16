import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import type { ContentPublish, ContentStatus } from './types'

/**
 * Admin edits write to the DB immediately; this bar pushes them back to
 * content/questions/*.json (one git commit in production) so the next
 * deploy's seed doesn't revert them.
 */
export function PublishBar() {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<ContentPublish | null>(null)
  const [error, setError] = useState('')

  const { data: status } = useQuery({
    queryKey: ['admin', 'content', 'status'],
    queryFn: () => api.get<ContentStatus>('/admin/content/status'),
    refetchInterval: 60_000,
  })

  const publish = useMutation({
    mutationFn: () => api.post<ContentPublish>('/admin/content/publish'),
    onSuccess: (data) => {
      setResult(data)
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'content'] })
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível publicar.'),
  })

  const dirtyCount = status?.dirty_files.length ?? 0
  if (dirtyCount === 0 && !result && !error) return null

  return (
    <div className="mb-6 space-y-2">
      {dirtyCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-grain-50 px-4 py-3 ring-1 ring-grain-300">
          <div>
            <p className="text-sm font-extrabold text-grain-800">
              {dirtyCount} {dirtyCount === 1 ? 'arquivo de conteúdo' : 'arquivos de conteúdo'} com
              alterações não publicadas
            </p>
            <p className="text-xs font-semibold text-grain-700">
              {status?.mode === 'github'
                ? 'Publicar cria 1 commit no repositório — o deploy seguinte realinha o banco.'
                : 'Publicar grava os arquivos em content/questions/ para você revisar no git.'}
            </p>
          </div>
          <Button variant="gold" loading={publish.isPending} onClick={() => publish.mutate()}>
            Publicar
          </Button>
        </div>
      )}

      {result && result.published.length > 0 && (
        <p className="rounded-2xl bg-leaf-50 px-4 py-3 text-sm font-bold text-leaf-800 ring-1 ring-leaf-200">
          ✅ {result.published.length}{' '}
          {result.published.length === 1 ? 'arquivo publicado' : 'arquivos publicados'}.{' '}
          {result.commit_url && (
            <a href={result.commit_url} target="_blank" rel="noreferrer" className="underline">
              Ver commit
            </a>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

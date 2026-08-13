import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate, formatDateTime, formatPercent, formatStudyTime } from '@/lib/format'
import type { AdminUserDetail } from './types'

export function UserDetail({
  userId,
  adminId,
  onClose,
}: {
  userId: string
  adminId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.get<AdminUserDetail>(`/admin/users/${userId}`),
  })

  const toggleActive = useMutation({
    mutationFn: (is_active: boolean) =>
      api.patch<AdminUserDetail>(`/admin/users/${userId}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
      setError('')
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o usuário.'),
  })

  const isSelf = data?.id === adminId

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe do usuário"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-sand-50 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Usuário</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-2xl text-sand-400 hover:text-sand-600"
          >
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7 text-leaf-500" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xl font-extrabold text-ink">{data.name}</p>
              <p className="text-sm font-semibold text-sand-500">@{data.username}</p>
              <p className="text-sm text-sand-500">{data.email}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                tone={data.role === 'admin' ? 'leaf' : 'sand'}
                label={data.role === 'admin' ? 'Admin' : 'Usuário'}
              />
              <Badge
                tone={data.email_verified_at ? 'leaf' : 'red'}
                label={data.email_verified_at ? 'E-mail confirmado' : 'E-mail não confirmado'}
              />
              <Badge
                tone={data.is_active ? 'leaf' : 'red'}
                label={data.is_active ? 'Ativo' : 'Inativo'}
              />
            </div>

            <Section title="Conta">
              <Row label="Cadastro" value={formatDateTime(data.created_at)} />
              <Row label="Atualizado" value={formatDateTime(data.updated_at)} />
              <Row
                label="E-mail confirmado em"
                value={formatDateTime(data.email_verified_at)}
              />
              <Row label="Fuso" value={data.timezone} />
              <Row label="Meta diária" value={`${data.daily_goal_xp} XP`} />
            </Section>

            <Section title="Progresso">
              <Row label="Nível" value={String(data.level)} />
              <Row label="XP total" value={String(data.total_xp)} />
              <Row label="Streak atual" value={`🔥 ${data.current_streak}`} />
              <Row label="Maior streak" value={String(data.longest_streak)} />
              <Row label="Última atividade" value={formatDate(data.last_activity_date)} />
              <Row label="Respondidas" value={String(data.questions_answered)} />
              <Row label="Acertos" value={String(data.correct_answers)} />
              <Row label="Precisão" value={formatPercent(data.accuracy)} />
              <Row label="Sessões perfeitas" value={String(data.perfect_sessions)} />
              <Row label="Tempo de estudo" value={formatStudyTime(data.total_time_seconds)} />
            </Section>

            <Section title="Duelos">
              <Row label="Vitórias" value={String(data.duel_wins)} />
              <Row label="Derrotas" value={String(data.duel_losses)} />
              <Row label="Empates" value={String(data.duel_draws)} />
              <Row label="Sequência atual" value={String(data.current_duel_streak)} />
              <Row label="Melhor sequência" value={String(data.best_duel_streak)} />
            </Section>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            {isSelf ? (
              <p className="rounded-xl bg-sand-100 px-3 py-2 text-sm font-semibold text-sand-600">
                Você não pode inativar a própria conta.
              </p>
            ) : (
              <Button
                full
                variant={data.is_active ? 'danger' : 'primary'}
                loading={toggleActive.isPending}
                onClick={() => toggleActive.mutate(!data.is_active)}
              >
                {data.is_active ? 'Inativar usuário' : 'Ativar usuário'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-sand-400">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="font-semibold text-sand-500">{label}</dt>
      <dd className="text-right font-bold text-ink">{value}</dd>
    </div>
  )
}

function Badge({ tone, label }: { tone: 'leaf' | 'sand' | 'red'; label: string }) {
  const styles = {
    leaf: 'bg-leaf-100 text-leaf-700',
    sand: 'bg-sand-100 text-sand-600',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${styles[tone]}`}>
      {label}
    </span>
  )
}

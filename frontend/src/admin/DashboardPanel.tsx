import { Card, CardTitle } from '@/components/ui/Card'
import { DIFFICULTY_LABELS, formatPercent } from '@/lib/format'
import type { AdminDashboard, AdminTab } from './types'

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

export function DashboardPanel({
  data,
  onNavigate,
}: {
  data: AdminDashboard
  onNavigate: (tab: AdminTab) => void
}) {
  const { users, questions, review, activity } = data
  const newTestament = questions.total - questions.old_testament
  const difficulties = [
    ['easy', questions.easy],
    ['medium', questions.medium],
    ['hard', questions.hard],
    ['expert', questions.expert],
  ] as const
  const maxDiff = Math.max(questions.easy, questions.medium, questions.hard, questions.expert, 1)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Início</h1>
        <p className="text-sm font-semibold text-sand-500">
          Visão geral do Mavva — só contagens, sem carregar tabelas.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStat
          emoji="👥"
          label="Usuários"
          value={users.total}
          hint={`${fmt(users.active)} contas ativas`}
          onClick={() => onNavigate('users')}
        />
        <HeroStat
          emoji="📖"
          label="Perguntas ativas"
          value={questions.active}
          hint={`${fmt(questions.total)} no banco`}
          onClick={() => onNavigate('questions')}
        />
        <HeroStat
          emoji="🔎"
          label="Fila de revisão"
          value={review.pending}
          hint={`${fmt(review.flags_open)} denúncias · ${fmt(review.proposals_pending)} sugestões`}
          highlight={review.pending > 0}
          onClick={() => onNavigate('review')}
        />
        <HeroStat
          emoji="🌾"
          label="Estudaram hoje"
          value={activity.studied_today}
          hint={`${fmt(activity.xp_today)} XP hoje`}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Novos em 7 dias" value={users.new_7d} />
        <MiniStat label="E-mail não confirmado" value={users.unverified} />
        <MiniStat label="Contas inativas" value={users.total - users.active} />
      </section>

      <Card>
        <CardTitle>Banco de perguntas</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Inativas" value={questions.inactive} nested />
          <MiniStat label="Resposta aberta" value={questions.open_answer} nested />
          <MiniStat
            label="Antigo / Novo Testamento"
            value={`${fmt(questions.old_testament)} / ${fmt(newTestament)}`}
            nested
          />
        </div>
        <ul className="mt-4 space-y-2">
          {difficulties.map(([key, count]) => (
            <li key={key} className="flex items-center gap-3 text-sm">
              <span className="w-24 font-extrabold text-sand-600">{DIFFICULTY_LABELS[key]}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                <span
                  className="block h-full rounded-full bg-leaf-400"
                  style={{ width: `${Math.round((count / maxDiff) * 100)}%` }}
                />
              </span>
              <span className="w-10 text-right font-bold text-ink">{fmt(count)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Atividade</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Perguntas respondidas" value={activity.questions_answered} nested />
          <MiniStat label="Precisão geral" value={formatPercent(activity.accuracy)} nested />
          <MiniStat label="XP acumulado" value={activity.total_xp} nested />
          <MiniStat label="Recorde de streak" value={`${fmt(activity.longest_streak)} dias`} nested />
          <MiniStat label="Nível mais alto" value={activity.max_level} nested />
          <MiniStat
            label="Duelos"
            value={`${fmt(activity.duels_finished)} encerrados`}
            hint={`${fmt(activity.duels_open)} na fila · ${fmt(activity.duels_active)} ativos`}
            nested
          />
          <MiniStat label="Amizades" value={activity.friendships} nested />
        </div>
      </Card>
    </div>
  )
}

function HeroStat({
  emoji,
  label,
  value,
  hint,
  highlight,
  onClick,
}: {
  emoji: string
  label: string
  value: number
  hint: string
  highlight?: boolean
  onClick?: () => void
}) {
  const className = `flex flex-col gap-1 text-left ${
    highlight ? 'bg-grain-50 ring-1 ring-grain-300' : ''
  } ${onClick ? 'cursor-pointer transition-colors hover:bg-sand-25' : ''}`
  const inner = (
    <>
      <p className="text-xs font-extrabold uppercase tracking-wide text-sand-500">
        <span aria-hidden>{emoji}</span> {label}
      </p>
      <p className="text-3xl font-extrabold text-ink">{fmt(value)}</p>
      <p className="text-xs font-semibold text-sand-400">{hint}</p>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`rounded-3xl bg-white p-5 shadow-card ${className}`}>
        {inner}
      </button>
    )
  }
  return <Card className={className}>{inner}</Card>
}

function MiniStat({
  label,
  value,
  hint,
  nested,
}: {
  label: string
  value: number | string
  hint?: string
  nested?: boolean
}) {
  return (
    <div className={nested ? 'rounded-2xl bg-sand-50 px-4 py-3' : 'rounded-3xl bg-white px-4 py-4 shadow-card'}>
      <p className="text-xs font-extrabold uppercase tracking-wide text-sand-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-ink">
        {typeof value === 'number' ? fmt(value) : value}
      </p>
      {hint && <p className="mt-0.5 text-xs font-semibold text-sand-400">{hint}</p>}
    </div>
  )
}

import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatPercent, formatStudyTime } from '@/lib/format'
import { AppIcons, CategoryGlyph, Glyph, type Icon } from '@/lib/icons'
import { ActivityChart } from './ActivityChart'
import { UserDetail } from './UserDetail'
import {
  ACTIVITY_METRICS,
  ACTIVITY_PRESETS,
  activityPath,
  addDays,
  formatChange,
  formatDay,
  percentChange,
  presetRange,
  todayInAppTimeZone,
  type ActivityMetric,
  type ActivityPreset,
  type ActivityRange,
} from './activity'
import type { AdminActivity } from './types'

const DEFAULT_PRESET = ACTIVITY_PRESETS[1]

const PER_BUCKET = { day: 'por dia', week: 'por semana', month: 'por mês' } as const

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function pill(active: boolean) {
  return `rounded-2xl px-3 py-1.5 text-sm font-extrabold transition-colors ${
    active ? 'bg-leaf-500 text-white' : 'bg-white text-sand-600 shadow-card hover:bg-sand-25'
  }`
}

export function ActivityPanel({ adminId }: { adminId: string }) {
  const today = todayInAppTimeZone()
  const [preset, setPreset] = useState<ActivityPreset>(DEFAULT_PRESET.key)
  const [range, setRange] = useState<ActivityRange>(() => presetRange(DEFAULT_PRESET.days, today))
  const [customOpen, setCustomOpen] = useState(false)
  const [metric, setMetric] = useState<ActivityMetric>('active_users')
  const [playerId, setPlayerId] = useState<string | null>(null)

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'activity', range.start, range.end],
    queryFn: () => api.get<AdminActivity>(activityPath(range)),
    placeholderData: keepPreviousData,
  })

  function choosePreset(key: ActivityPreset, days: number | null) {
    setPreset(key)
    setRange(presetRange(days, today))
    setCustomOpen(false)
  }

  function applyCustom(start: string, end: string) {
    setPreset('custom')
    setRange({ start, end })
    setCustomOpen(false)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold">Atividade</h1>
          {isFetching && !isPending && <Spinner className="h-4 w-4 text-leaf-500" />}
        </div>
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {ACTIVITY_PRESETS.map(({ key, label, days }) => (
            <button
              key={key}
              type="button"
              aria-pressed={preset === key}
              onClick={() => choosePreset(key, days)}
              className={pill(preset === key)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={preset === 'custom'}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
            className={pill(preset === 'custom')}
          >
            Personalizado
          </button>
        </div>
        {customOpen && (
          <CustomRange
            today={today}
            initialStart={range.start ?? data?.range.first_day ?? addDays(today, -29)}
            initialEnd={range.end ?? today}
            onApply={applyCustom}
          />
        )}
        {data && <RangeSummary range={data.range} />}
      </header>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-leaf-500" />
        </div>
      ) : !data ? (
        <Card className="space-y-3 text-center">
          <p className="font-bold text-ink">
            {error?.message ?? 'Não foi possível carregar a atividade.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-leaf-600"
          >
            Tentar de novo
          </button>
        </Card>
      ) : (
        <div className={`space-y-6 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
            >
              {error.message}
            </p>
          )}
          <Kpis data={data} />

          <Card>
            <CardTitle>Evolução {PER_BUCKET[data.range.granularity]}</CardTitle>
            <div
              role="group"
              aria-label="Métrica do gráfico"
              className="mb-4 flex flex-wrap gap-1.5"
            >
              {(Object.keys(ACTIVITY_METRICS) as ActivityMetric[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={metric === key}
                  onClick={() => setMetric(key)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-extrabold transition-colors ${
                    metric === key
                      ? 'bg-ink text-white'
                      : 'bg-sand-50 text-sand-600 hover:bg-sand-100'
                  }`}
                >
                  {ACTIVITY_METRICS[key]}
                </button>
              ))}
            </div>
            <ActivityChart
              series={data.series}
              granularity={data.range.granularity}
              metric={metric}
            />
            {metric === 'active_users' && data.range.granularity !== 'day' && (
              <p className="mt-2 text-xs font-semibold text-sand-400">
                Cada barra conta jogadores diferentes{' '}
                {data.range.granularity === 'week' ? 'na semana' : 'no mês'}: quem jogou em vários
                dias aparece uma vez só.
              </p>
            )}
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <StatList
              title="Sessões"
              items={[
                ['Treinos concluídos', data.totals.practice_completed],
                ['Revisões concluídas', data.totals.review_completed],
                ['Rodadas de duelo', data.totals.duel_rounds_completed],
                ['Sessões perfeitas', data.totals.perfect_sessions],
                ['Abandonadas', data.totals.quizzes_abandoned],
              ]}
            />
            <StatList
              title="Comunidade"
              items={[
                ['Duelos criados', data.totals.duels_started],
                ['Duelos encerrados', data.totals.duels_finished],
                ['Amizades feitas', data.totals.friendships],
                ['Conquistas desbloqueadas', data.totals.achievements_unlocked],
              ]}
            />
            <StatList
              title="Recebido para revisão"
              items={[
                ['Denúncias de perguntas', data.totals.reports],
                ['Perguntas sugeridas', data.totals.question_proposals],
                ['Sugestões de melhoria', data.totals.suggestions],
              ]}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TopCategories categories={data.top_categories} />
            <TopPlayers players={data.top_players} onSelect={setPlayerId} />
          </div>
        </div>
      )}

      {playerId && (
        <UserDetail userId={playerId} adminId={adminId} onClose={() => setPlayerId(null)} />
      )}
    </div>
  )
}

function CustomRange({
  today,
  initialStart,
  initialEnd,
  onApply,
}: {
  today: string
  initialStart: string
  initialEnd: string
  onApply: (start: string, end: string) => void
}) {
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  // Nothing is fetched while typing: half-typed years would be valid dates.
  const problem =
    start && end && start > end
      ? 'A data inicial precisa ser anterior à final.'
      : end > today
        ? 'A data final não pode estar no futuro.'
        : ''

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4 shadow-card"
      onSubmit={(event) => {
        event.preventDefault()
        if (start && end && !problem) onApply(start, end)
      }}
    >
      <div className="w-44">
        <Input
          type="date"
          label="De"
          value={start}
          max={today}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="w-44">
        <Input
          type="date"
          label="Até"
          value={end}
          max={today}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={!start || !end || Boolean(problem)}
        className="rounded-2xl bg-leaf-500 px-4 py-3 text-sm font-extrabold text-white hover:bg-leaf-600 disabled:opacity-40"
      >
        Aplicar
      </button>
      {problem && (
        <p role="alert" className="basis-full text-xs font-semibold text-red-600">
          {problem}
        </p>
      )}
    </form>
  )
}

function RangeSummary({ range }: { range: AdminActivity['range'] }) {
  if (range.start === null) {
    return (
      <p className="text-sm font-semibold text-sand-500">
        Desde {formatDay(range.first_day)}, o primeiro dia com dados, até {formatDay(range.end)}
      </p>
    )
  }
  return (
    <p className="text-sm font-semibold text-sand-500">
      De {formatDay(range.start)} a {formatDay(range.end)}
      {range.first_day > range.start && (
        <span className="text-sand-400"> · sem dados antes de {formatDay(range.first_day)}</span>
      )}
    </p>
  )
}

function Kpis({ data }: { data: AdminActivity }) {
  const { totals, previous } = data
  const cards: {
    icon: Icon
    label: string
    value: string
    current: number
    before?: number
    hint: string
  }[] = [
    {
      icon: AppIcons.users,
      label: 'Jogadores ativos',
      value: fmt(totals.active_users),
      current: totals.active_users,
      before: previous?.active_users,
      hint: 'responderam ao menos uma pergunta',
    },
    {
      icon: AppIcons.plant,
      label: 'Novos usuários',
      value: fmt(totals.new_users),
      current: totals.new_users,
      before: previous?.new_users,
      hint: 'contas criadas',
    },
    {
      icon: AppIcons.study,
      label: 'Perguntas respondidas',
      value: fmt(totals.questions_answered),
      current: totals.questions_answered,
      before: previous?.questions_answered,
      hint: `${formatPercent(totals.accuracy)} de acerto`,
    },
    {
      icon: AppIcons.star,
      label: 'XP ganho',
      value: fmt(totals.xp),
      current: totals.xp,
      before: previous?.xp,
      hint: 'somando duelos e conquistas',
    },
    {
      icon: AppIcons.timer,
      label: 'Tempo de estudo',
      value: formatStudyTime(totals.study_seconds),
      current: totals.study_seconds,
      before: previous?.study_seconds,
      hint: 'em sessões concluídas',
    },
  ]
  const changes = cards.map(({ current, before }) => percentChange(current, before))

  return (
    <section className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ icon, label, value, hint }, index) => {
          const change = changes[index]
          return (
            <Card key={label}>
              <div role="group" aria-label={label} className="flex flex-col gap-1">
                <p className="inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-sand-500">
                  <Glyph as={icon} className="h-3.5 w-3.5" />
                  {label}
                </p>
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-2xl font-extrabold text-ink">{value}</p>
                  {change !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                        change > 0.005
                          ? 'bg-leaf-100 text-leaf-700'
                          : change < -0.005
                            ? 'bg-red-50 text-red-700'
                            : 'bg-sand-100 text-sand-600'
                      }`}
                    >
                      {formatChange(change)}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-sand-400">{hint}</p>
              </div>
            </Card>
          )
        })}
      </div>
      {/* A previous window with no data (e.g. before launch) has nothing to compare. */}
      {previous && changes.some((change) => change !== null) && (
        <p className="text-xs font-semibold text-sand-400">
          {`Variação em relação aos ${fmt(daysIn(previous.start, previous.end))} dias anteriores ` +
            `(${formatDay(previous.start)} a ${formatDay(previous.end)}).`}
        </p>
      )}
    </section>
  )
}

function daysIn(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
}

function StatList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <dl className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="font-semibold text-sand-600">{label}</dt>
            <dd className="font-extrabold text-ink">{fmt(value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function TopCategories({ categories }: { categories: AdminActivity['top_categories'] }) {
  const most = Math.max(...categories.map((category) => category.answered), 1)
  return (
    <Card>
      <CardTitle>Categorias mais jogadas</CardTitle>
      {categories.length === 0 ? (
        <p className="text-sm font-semibold text-sand-400">Nenhuma resposta no período.</p>
      ) : (
        <ol className="space-y-3">
          {categories.map((category) => (
            <li key={category.slug} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand-50 text-sand-600">
                <CategoryGlyph slug={category.slug} emoji={category.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-bold text-ink">{category.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-sand-500">
                    {fmt(category.answered)} respostas · {formatPercent(category.accuracy)} de
                    acerto
                  </span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-sand-100">
                  <span
                    className="block h-full rounded-full bg-leaf-400"
                    style={{ width: `${Math.round((category.answered / most) * 100)}%` }}
                  />
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function TopPlayers({
  players,
  onSelect,
}: {
  players: AdminActivity['top_players']
  onSelect: (id: string) => void
}) {
  return (
    <Card>
      <CardTitle>Quem mais ganhou XP</CardTitle>
      {players.length === 0 ? (
        <p className="text-sm font-semibold text-sand-400">Ninguém ganhou XP no período.</p>
      ) : (
        <ol className="-mx-2 space-y-1">
          {players.map((player, index) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => onSelect(player.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-sand-25"
              >
                <span className="w-5 text-center text-sm font-extrabold text-sand-400">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{player.name}</span>
                  <span className="block truncate text-xs font-semibold text-sand-500">
                    @{player.username}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-extrabold text-ink">{fmt(player.xp)} XP</span>
                  <span className="block text-xs font-semibold text-sand-400">
                    {fmt(player.questions_answered)} perguntas
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

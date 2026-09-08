import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { api } from '@/lib/api'
import type { DashboardData } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { Spinner } from '@/components/ui/Spinner'
import { RankLadder } from '@/components/RankLadder'
import { AppIcons, CategoryGlyph, Glyph, type Icon } from '@/lib/icons'
import { formatPercent, formatRelativeDate } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthContext'
import { EvolutionChart } from './EvolutionChart'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const { stats, daily_goal, categories, recent_sessions, reviews_due } = data
  const firstName = user?.name.split(' ')[0] ?? 'você'
  const remaining = Math.max(0, daily_goal.target - daily_goal.earned_today)
  const practiced = categories
    .filter((category) => category.answered > 0)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.answered - a.answered)
    .slice(0, 8)
  const week = lastSevenDays(data.evolution)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const enter = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 28 } },
      }

  return (
    <motion.div
      className="space-y-5"
      initial={reduceMotion ? undefined : 'hidden'}
      animate={reduceMotion ? undefined : 'show'}
      variants={
        reduceMotion
          ? undefined
          : { show: { transition: { staggerChildren: 0.07 } } }
      }
    >
      <motion.section
        variants={enter}
        className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-leaf-800 via-leaf-600 to-leaf-700 p-5 text-white shadow-[0_8px_0_0_#184220] sm:p-6"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="animate-soft-glow absolute -right-10 -top-12 h-44 w-44 rounded-full bg-grain-300/30 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/10 blur-xl" />
          <div className="absolute right-10 top-8 h-2 w-2 rounded-full bg-grain-200/70" />
        </div>

        <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
          <ProgressRing
            value={daily_goal.earned_today}
            max={daily_goal.target}
            size={132}
            stroke={12}
            trackClass="stroke-white/20"
            barClass={daily_goal.achieved ? 'stroke-grain-300' : 'stroke-grain-200'}
          >
            <div className="text-center">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">Maná</p>
              <p className="text-2xl font-extrabold leading-none">{daily_goal.earned_today}</p>
              <p className="text-[10px] font-bold text-white/70">de {daily_goal.target}</p>
            </div>
          </ProgressRing>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-grain-200">
              {greeting}, {firstName}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
              {daily_goal.achieved ? 'O celeiro de hoje encheu' : 'Recolha o maná de hoje'}
            </h1>
            <p className="mt-1 text-sm font-bold text-white/80">
              {daily_goal.achieved
                ? 'Meta cumprida. Pode jogar de novo só pela Palavra — ou desafiar alguém.'
                : `Faltam ${remaining} XP para guardar o maná do dia.`}
            </p>
            <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row">
              <Button
                variant="gold"
                className="w-full shadow-[0_4px_0_0_#aa5012] sm:w-auto"
                onClick={() => navigate('/quiz/new')}
              >
                {daily_goal.achieved ? 'Jogar de novo' : 'Recolher maná'}
              </Button>
              <p className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-extrabold text-grain-200">
                {stats.questions_answered > 0
                  ? `${formatPercent(stats.accuracy)} de acerto · ${stats.questions_answered} perguntas`
                  : 'Seu primeiro quiz destrava o mapa'}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.div variants={enter}>
        <RankLadder currentCode={stats.rank.code} />
      </motion.div>

      {data.friend_requests > 0 && (
        <motion.button
          variants={enter}
          type="button"
          onClick={() => navigate('/friends')}
          className="btn-press flex w-full items-center gap-3 rounded-3xl border-grain-500 bg-grain-50 px-4 py-3 text-left"
        >
          <Glyph as={AppIcons.friends} className="h-7 w-7 text-grain-700" />
          <span className="flex-1 text-sm font-extrabold text-ink">
            {data.friend_requests === 1
              ? 'Alguém quer ser seu amigo'
              : `${data.friend_requests} pedidos de amizade`}
          </span>
          <span className="rounded-full bg-grain-400 px-2.5 py-0.5 text-xs font-extrabold text-grain-900">
            {data.friend_requests}
          </span>
        </motion.button>
      )}

      <motion.div variants={enter} className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <ModeTile
          icon={AppIcons.review}
          label="Revisar"
          hint={reviews_due > 0 ? `${reviews_due} na fila` : 'Em dia'}
          badge={reviews_due}
          tone={reviews_due > 0 ? 'leaf' : 'sand'}
          action="review"
          onClick={() => navigate('/review')}
        />
        <ModeTile
          icon={AppIcons.duels}
          label="Duelar"
          hint={
            data.duels.awaiting_me > 0
              ? `${data.duels.awaiting_me} à sua espera`
              : data.duels.wins + data.duels.losses + data.duels.draws === 0
                ? 'Desafie alguém'
                : `${data.duels.wins}V · ${data.duels.losses}D`
          }
          badge={data.duels.awaiting_me}
          tone={data.duels.awaiting_me > 0 ? 'gold' : 'sand'}
          action="duel"
          onClick={() => navigate('/duels')}
        />
        <ModeTile
          icon={AppIcons.achievements}
          label="Troféus"
          hint={`${stats.perfect_sessions} perfeitos`}
          tone="sand"
          action="trophy"
          onClick={() => navigate('/achievements')}
        />
      </motion.div>

      <motion.section
        variants={enter}
        className="rounded-3xl bg-white/75 px-4 py-4 shadow-card backdrop-blur-sm sm:px-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-sand-600">
            Semana
          </h2>
          <p className="text-[11px] font-bold text-sand-400">
            {week.filter((day) => day.xp > 0).length}/7 dias
          </p>
        </div>
        <ol className="grid grid-cols-7 gap-1.5">
          {week.map((day) => (
            <li key={day.iso} className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-extrabold ${
                  day.xp > 0
                    ? day.isToday
                      ? 'bg-grain-400 text-grain-900 shadow-[0_3px_0_0_#aa5012]'
                      : 'bg-leaf-500 text-white shadow-[0_3px_0_0_#1e6329]'
                    : day.isToday
                      ? 'bg-white text-leaf-700 ring-2 ring-leaf-400'
                      : 'bg-sand-100 text-sand-400'
                }`}
                title={day.xp > 0 ? `${day.xp} XP` : 'Sem estudo'}
              >
                {day.xp > 0 ? <Glyph as={AppIcons.sparkle} className="h-4 w-4" /> : day.label}
              </span>
              <span className="text-xs font-extrabold uppercase text-sand-500">{day.label}</span>
            </li>
          ))}
        </ol>
      </motion.section>

      <motion.section variants={enter} className="rounded-3xl bg-white/75 p-5 shadow-card backdrop-blur-sm">
        <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-sand-600">
          Categorias
        </h2>
        {practiced.length === 0 ? (
          <p className="py-6 text-center text-sm font-bold text-sand-500">
            Complete um quiz para abrir o mapa de categorias.
          </p>
        ) : (
          <ul className="grid grid-cols-4 gap-3">
            {practiced.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate('/quiz/new', { state: { categorySlug: category.slug } })
                  }
                  className="flex w-full flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-transform hover:scale-105 active:scale-95"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-700 ring-2 ring-leaf-100">
                    <CategoryGlyph slug={category.slug} emoji={category.icon} className="h-7 w-7" />
                  </span>
                  <span className="line-clamp-2 w-full text-center text-xs font-extrabold leading-tight text-ink">
                    {category.name}
                  </span>
                  <span className="text-xs font-bold text-sand-500">
                    {formatPercent(category.accuracy)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      {recent_sessions.length > 0 && (
        <motion.section variants={enter} className="rounded-3xl bg-white/75 p-5 shadow-card backdrop-blur-sm">
          <h2 className="mb-1 text-xs font-extrabold uppercase tracking-wider text-sand-600">
            Partidas
          </h2>
          <ul className="divide-y divide-sand-100">
            {recent_sessions.slice(0, 4).map((session) => {
              const pendingDuel = session.mode === 'duel' && session.xp_earned === 0
              const xpClass = pendingDuel
                ? 'bg-sand-100 text-sand-600'
                : session.xp_earned < 0
                  ? 'bg-red-50 text-red-600'
                  : 'bg-grain-100 text-grain-800'
              return (
                <li key={session.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sand-50 text-leaf-700"
                      aria-hidden
                    >
                      <Glyph
                        as={
                          session.mode === 'duel'
                            ? AppIcons.duels
                            : session.mode === 'review'
                              ? AppIcons.review
                              : AppIcons.study
                        }
                        className="h-5 w-5"
                      />
                    </span>
                    <div>
                      <p className="text-sm font-extrabold">
                        {session.correct_count}/{session.question_count} acertos
                      </p>
                      <p className="text-[11px] font-bold text-sand-500">
                        {session.mode === 'duel' ? 'Duelo · ' : ''}
                        {session.completed_at ? formatRelativeDate(session.completed_at) : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${xpClass}`}>
                    {pendingDuel
                      ? 'aguardando'
                      : session.xp_earned > 0
                        ? `+${session.xp_earned} XP`
                        : session.xp_earned < 0
                          ? `${session.xp_earned} XP`
                          : '0 XP'}
                  </span>
                </li>
              )
            })}
          </ul>
        </motion.section>
      )}

      <motion.details variants={enter} className="group rounded-3xl bg-white/75 shadow-card backdrop-blur-sm">
        <summary className="cursor-pointer list-none px-5 py-4 text-xs font-extrabold uppercase tracking-wider text-sand-600 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between">
            Evolução — 30 dias
            <span className="text-sand-400 group-open:rotate-180">▾</span>
          </span>
        </summary>
        <div className="px-5 pb-5">
          <EvolutionChart data={data.evolution} />
        </div>
      </motion.details>
    </motion.div>
  )
}

function ModeTile({
  icon,
  label,
  hint,
  badge = 0,
  tone,
  action,
  onClick,
}: {
  icon: Icon
  label: string
  hint: string
  badge?: number
  tone: 'leaf' | 'gold' | 'sand'
  action: 'review' | 'duel' | 'trophy'
  onClick: () => void
}) {
  const tones = {
    leaf: 'border-leaf-700 bg-leaf-500 text-white',
    gold: 'border-grain-700 bg-grain-400 text-grain-900',
    sand: 'border-sand-300 bg-white/80 text-ink',
  }
  const hovers = {
    review:
      tone === 'leaf'
        ? 'hover:bg-leaf-600 hover:border-leaf-800'
        : 'hover:border-leaf-400 hover:bg-leaf-100 hover:text-leaf-800',
    duel:
      tone === 'gold'
        ? 'hover:border-grain-700 hover:bg-grain-300'
        : 'hover:border-red-300 hover:bg-red-50 hover:text-red-700',
    trophy: 'hover:border-grain-400 hover:bg-grain-100 hover:text-grain-900',
  }
  const iconMotion = {
    review: 'group-hover:animate-icon-spin',
    duel: 'group-hover:animate-icon-slash',
    trophy: 'group-hover:animate-icon-shine',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-press group relative flex flex-col items-center justify-center rounded-3xl px-2 py-4 text-center transition-[transform,background-color,border-color,color] hover:scale-105 active:scale-95 sm:px-3 ${tones[tone]} ${hovers[action]}`}
    >
      {badge > 0 && (
        <span
          className={`absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold ${
            tone === 'gold' ? 'bg-ink text-white' : 'bg-grain-400 text-grain-900'
          }`}
        >
          {badge}
        </span>
      )}
      <span className={`relative inline-flex ${action === 'trophy' ? 'overflow-hidden' : ''}`}>
        <Glyph as={icon} className={`h-7 w-7 sm:h-8 sm:w-8 ${iconMotion[action]}`} />
        {action === 'trophy' && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-0 group-hover:animate-shine-sweep"
          />
        )}
      </span>
      <span className="mt-1 text-xs font-extrabold uppercase tracking-wide sm:text-sm">
        {label}
      </span>
      <span
        className={`mt-0.5 text-xs font-bold leading-tight group-hover:text-inherit ${
          tone === 'sand' ? 'text-sand-500' : 'opacity-80'
        }`}
      >
        {hint}
      </span>
    </button>
  )
}

function lastSevenDays(evolution: { date: string; xp: number }[]) {
  const byDate = new Map(evolution.map((point) => [point.date, point.xp]))
  const days: { iso: string; xp: number; isToday: boolean; label: string }[] = []
  const today = new Date()
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
    const iso = [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
    ].join('-')
    days.push({
      iso,
      xp: byDate.get(iso) ?? 0,
      isToday: offset === 0,
      label: day.toLocaleDateString('pt-BR', { weekday: 'narrow' }),
    })
  }
  return days
}

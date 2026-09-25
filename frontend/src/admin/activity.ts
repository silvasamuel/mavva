import type { ActivityGranularity, AdminActivityPoint } from './types'

// The backend reads every range as Brasília calendar days, so "today" and the
// presets are computed there too, whatever timezone the admin is in.
const APP_TIME_ZONE = 'America/Sao_Paulo'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const ACTIVITY_PRESETS = [
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: '12m', label: '12 meses', days: 365 },
  { key: 'all', label: 'Desde o início', days: null },
] as const

export type ActivityPreset = (typeof ACTIVITY_PRESETS)[number]['key'] | 'custom'

export const ACTIVITY_METRICS = {
  active_users: 'Jogadores ativos',
  new_users: 'Novos usuários',
  questions_answered: 'Perguntas',
  xp: 'XP',
  study_seconds: 'Tempo de estudo',
} as const satisfies Record<Exclude<keyof AdminActivityPoint, 'bucket'>, string>

export type ActivityMetric = keyof typeof ACTIVITY_METRICS

/** Inclusive YYYY-MM-DD bounds; null start = desde o início, null end = hoje. */
export interface ActivityRange {
  start: string | null
  end: string | null
}

/** Today as YYYY-MM-DD in Brasília. */
export function todayInAppTimeZone(now: Date = new Date()): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** Calendar arithmetic on YYYY-MM-DD (in UTC, so no DST surprises). */
export function addDays(iso: string, days: number): string {
  const date = utcDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function presetRange(days: number | null, today: string): ActivityRange {
  return { start: days === null ? null : addDays(today, -(days - 1)), end: null }
}

export function activityPath({ start, end }: ActivityRange): string {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const query = params.toString()
  return query ? `/admin/activity?${query}` : '/admin/activity'
}

/** 25/09/2026 */
export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** Short x-axis label: 25/09 for days and weeks, set/26 for months. */
export function bucketTick(bucket: string, granularity: ActivityGranularity): string {
  const [year, month, day] = bucket.split('-')
  if (granularity === 'month') return `${MONTHS[Number(month) - 1]}/${year.slice(2)}`
  return `${day}/${month}`
}

/** Tooltip title for a chart bar. */
export function bucketTitle(bucket: string, granularity: ActivityGranularity): string {
  if (granularity === 'week') return `Semana de ${formatDay(bucket)}`
  return utcDate(bucket).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    ...(granularity === 'month'
      ? { month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }),
  })
}

/** Relative change vs. the previous window; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous <= 0) return null
  return (current - previous) / previous
}

/** +12%, −8% (true minus sign) or 0%. */
export function formatChange(change: number): string {
  const percent = Math.round(change * 100)
  if (percent === 0) return '0%'
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`
}

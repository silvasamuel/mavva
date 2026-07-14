import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '@/components/ui/EmptyState'

interface Point {
  date: string
  xp: number
  questions: number
}

/** Fills the 30-day window so days without study show as zero. */
function fillWindow(data: Point[]): Point[] {
  const byDate = new Map(data.map((point) => [point.date, point]))
  const points: Point[] = []
  const today = new Date()
  for (let offset = 29; offset >= 0; offset--) {
    const day = new Date(today)
    day.setDate(today.getDate() - offset)
    const iso = day.toISOString().slice(0, 10)
    points.push(byDate.get(iso) ?? { date: iso, xp: 0, questions: 0 })
  }
  return points
}

export function EvolutionChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="Seu gráfico nasce no primeiro quiz"
        description="Estude hoje e volte aqui para ver sua constância tomar forma."
      />
    )
  }
  const points = fillWindow(data)

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#57b663" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#57b663" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 8" stroke="#e5dfcd" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => value.slice(8, 10) + '/' + value.slice(5, 7)}
            tick={{ fontSize: 11, fontWeight: 700, fill: '#9c8d67' }}
            tickLine={false}
            axisLine={false}
            interval={6}
          />
          <YAxis
            tick={{ fontSize: 11, fontWeight: 700, fill: '#9c8d67' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === 'xp' ? `${value} XP` : `${value} perguntas`,
              name === 'xp' ? 'XP' : 'Perguntas',
            ]}
            labelFormatter={(label: string) =>
              new Date(label + 'T12:00:00').toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
              })
            }
            contentStyle={{
              borderRadius: 16,
              border: '1px solid #e5dfcd',
              fontWeight: 700,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="xp"
            stroke="#329a40"
            strokeWidth={2.5}
            fill="url(#xpFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

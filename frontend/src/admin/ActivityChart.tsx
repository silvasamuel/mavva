import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatStudyTime } from '@/lib/format'
import { ACTIVITY_METRICS, bucketTick, bucketTitle, type ActivityMetric } from './activity'
import type { ActivityGranularity, AdminActivityPoint } from './types'

const TICK = { fontSize: 11, fontWeight: 700, fill: '#9c8d67' }

function formatValue(value: number, metric: ActivityMetric): string {
  if (metric === 'study_seconds') return formatStudyTime(value)
  const count = value.toLocaleString('pt-BR')
  return metric === 'xp' ? `${count} XP` : count
}

/** Study time is plotted in minutes so the axis lands on round numbers. */
function formatAxis(value: number, metric: ActivityMetric): string {
  if (metric !== 'study_seconds') return value.toLocaleString('pt-BR', { notation: 'compact' })
  if (value < 60) return `${value} min`
  return `${(value / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}

export function ActivityChart({
  series,
  granularity,
  metric,
}: {
  series: AdminActivityPoint[]
  granularity: ActivityGranularity
  metric: ActivityMetric
}) {
  const data = series.map((point) => ({
    bucket: point.bucket,
    raw: point[metric],
    value: metric === 'study_seconds' ? Math.round(point.study_seconds / 60) : point[metric],
  }))

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="4 8" stroke="#e5dfcd" vertical={false} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(bucket: string) => bucketTick(bucket, granularity)}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={12}
          />
          <YAxis
            tickFormatter={(value: number) => formatAxis(value, metric)}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: '#f4f1e8' }}
            formatter={(_value, _name, item) => [
              formatValue((item.payload as { raw: number }).raw, metric),
              ACTIVITY_METRICS[metric],
            ]}
            labelFormatter={(bucket: string) => bucketTitle(bucket, granularity)}
            contentStyle={{
              borderRadius: 16,
              border: '1px solid #e5dfcd',
              fontWeight: 700,
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" fill="#57b663" radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

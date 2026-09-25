import { cloneElement, type ReactElement } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminActivityPoint } from './types'
import { ActivityChart } from './ActivityChart'

vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal<typeof import('recharts')>()
  return {
    ...recharts,
    // jsdom has no layout, so hand the chart a fixed size.
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 640, height: 256 }),
  }
})

const series: AdminActivityPoint[] = [
  {
    bucket: '2026-08-31',
    active_users: 3,
    new_users: 1,
    questions_answered: 40,
    xp: 500,
    study_seconds: 5400,
  },
  {
    bucket: '2026-09-07',
    active_users: 5,
    new_users: 0,
    questions_answered: 90,
    xp: 800,
    study_seconds: 7200,
  },
]

// Axis labels only — recharts also copies text into a hidden measuring span.
function ticks(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.recharts-cartesian-axis-tick-value')).map(
    (tick) => tick.textContent
  )
}

describe('ActivityChart', () => {
  it('labels each week by its Monday', () => {
    const { container } = render(
      <ActivityChart series={series} granularity="week" metric="active_users" />
    )

    expect(ticks(container)).toEqual(expect.arrayContaining(['31/08', '07/09']))
  })

  it('labels months by name', () => {
    const months = [
      { ...series[0], bucket: '2026-08-01' },
      { ...series[1], bucket: '2026-09-01' },
    ]
    const { container } = render(<ActivityChart series={months} granularity="month" metric="xp" />)

    expect(ticks(container)).toEqual(expect.arrayContaining(['ago/26', 'set/26']))
  })

  it('plots study time in minutes, with hours on the axis', () => {
    const { container } = render(
      <ActivityChart series={series} granularity="week" metric="study_seconds" />
    )

    expect(ticks(container)).toEqual(expect.arrayContaining(['30 min', '1 h', '1,5 h', '2 h']))
  })
})

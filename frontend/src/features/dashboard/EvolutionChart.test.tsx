import { cloneElement, type ComponentProps, type ReactElement } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EvolutionChart } from './EvolutionChart'

const plotted = vi.hoisted(() => ({ days: [] as unknown[] }))

vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal<typeof import('recharts')>()
  return {
    ...recharts,
    // jsdom has no layout, so hand the chart a fixed size.
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 640, height: 256 }),
    // The axis only labels every 7th day, so read the plotted days from the chart itself.
    AreaChart: (props: ComponentProps<typeof recharts.AreaChart>) => {
      plotted.days = props.data ?? []
      return <recharts.AreaChart {...props} />
    },
  }
})

describe('EvolutionChart', () => {
  beforeEach(() => {
    // CI runs in UTC, where local and UTC days never differ. Players are in Brazil.
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    // 22:00 on 25/09 in São Paulo, when UTC has already turned to 26/09.
    vi.useFakeTimers({ now: new Date('2026-09-26T01:00:00Z'), toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('keeps today in the last slot after 21:00, when UTC is already tomorrow', () => {
    render(<EvolutionChart data={[{ date: '2026-09-25', xp: 120, questions: 8 }]} />)

    expect(plotted.days.at(-1)).toEqual({ date: '2026-09-25', xp: 120, questions: 8 })
    expect(plotted.days[0]).toEqual({ date: '2026-08-27', xp: 0, questions: 0 })
    expect(plotted.days).toHaveLength(30)
  })
})

import { describe, expect, it } from 'vitest'
import { formatDays, formatPercent, formatStudyTime } from './format'

describe('formatStudyTime', () => {
  it('shows seconds under a minute', () => {
    expect(formatStudyTime(45)).toBe('45s')
  })
  it('shows minutes under an hour', () => {
    expect(formatStudyTime(340)).toBe('6 min')
  })
  it('shows hours and minutes', () => {
    expect(formatStudyTime(4980)).toBe('1h 23min')
  })
})

describe('formatPercent', () => {
  it('rounds ratios', () => {
    expect(formatPercent(0.876)).toBe('88%')
  })
  it('handles null as em dash', () => {
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatDays', () => {
  it('uses the singular for one day', () => {
    expect(formatDays(1)).toBe('1 dia')
  })
  it('keeps exact days under two months', () => {
    expect(formatDays(57)).toBe('57 dias')
  })
  it('rounds to months past that', () => {
    expect(formatDays(130)).toBe('~4 meses')
  })
  it('rounds to years from a year on', () => {
    expect(formatDays(365)).toBe('~1 ano')
    expect(formatDays(800)).toBe('~2 anos')
  })
})

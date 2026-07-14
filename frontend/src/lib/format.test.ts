import { describe, expect, it } from 'vitest'
import { formatPercent, formatStudyTime } from './format'

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

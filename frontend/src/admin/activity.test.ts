import { describe, expect, it } from 'vitest'
import {
  activityPath,
  addDays,
  bucketTick,
  bucketTitle,
  formatChange,
  formatDay,
  percentChange,
  presetRange,
  todayInAppTimeZone,
} from './activity'

describe('todayInAppTimeZone', () => {
  it('follows the Brasília calendar, not UTC', () => {
    // 01:00 UTC is still 22:00 of the day before in Brasília.
    expect(todayInAppTimeZone(new Date('2026-09-26T01:00:00Z'))).toBe('2026-09-25')
    expect(todayInAppTimeZone(new Date('2026-09-26T03:00:00Z'))).toBe('2026-09-26')
  })
})

describe('addDays', () => {
  it('crosses months, years and leap days', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-09-25', -29)).toBe('2026-08-27')
  })
})

describe('presetRange', () => {
  it('counts today as the last day of the window', () => {
    expect(presetRange(7, '2026-09-25')).toEqual({ start: '2026-09-19', end: null })
    expect(presetRange(30, '2026-09-25')).toEqual({ start: '2026-08-27', end: null })
  })

  it('has no start for "desde o início"', () => {
    expect(presetRange(null, '2026-09-25')).toEqual({ start: null, end: null })
  })
})

describe('activityPath', () => {
  it('only sends the bounds that are set', () => {
    expect(activityPath({ start: null, end: null })).toBe('/admin/activity')
    expect(activityPath({ start: '2026-09-01', end: null })).toBe(
      '/admin/activity?start=2026-09-01'
    )
    expect(activityPath({ start: '2026-09-01', end: '2026-09-10' })).toBe(
      '/admin/activity?start=2026-09-01&end=2026-09-10'
    )
  })
})

describe('bucket labels', () => {
  it('formats the axis per granularity', () => {
    expect(bucketTick('2026-09-05', 'day')).toBe('05/09')
    expect(bucketTick('2026-09-21', 'week')).toBe('21/09')
    expect(bucketTick('2026-09-01', 'month')).toBe('set/26')
    expect(formatDay('2026-09-05')).toBe('05/09/2026')
  })

  it('titles the tooltip per granularity', () => {
    expect(bucketTitle('2026-09-21', 'week')).toBe('Semana de 21/09/2026')
    expect(bucketTitle('2026-09-01', 'month')).toBe('setembro de 2026')
    expect(bucketTitle('2026-09-25', 'day')).toContain('25 de setembro de 2026')
  })
})

describe('percentChange', () => {
  it('compares with the previous window', () => {
    expect(percentChange(30, 20)).toBe(0.5)
    expect(percentChange(12, 16)).toBe(-0.25)
    expect(percentChange(100, 100)).toBe(0)
  })

  it('has nothing to say without a baseline', () => {
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(5, undefined)).toBeNull()
  })

  it('formats with a sign', () => {
    expect(formatChange(0.5)).toBe('+50%')
    expect(formatChange(-0.25)).toBe('−25%')
    expect(formatChange(0.001)).toBe('0%')
  })
})

import { describe, expect, it } from 'vitest'
import { MONTH_TROPHIES, trophyForSeason } from './trophies'

describe('month trophies', () => {
  it('has twelve distinct trophies, one tribe each', () => {
    expect(MONTH_TROPHIES).toHaveLength(12)
    expect(new Set(MONTH_TROPHIES.map((t) => t.tribe)).size).toBe(12)
    expect(new Set(MONTH_TROPHIES.map((t) => t.gem.join())).size).toBe(12)
  })

  it('picks the trophy from the season name', () => {
    expect(trophyForSeason('setembro de 2026')).toMatchObject({ short: 'SET', tribe: 'Issacar' })
    expect(trophyForSeason('Março de 2027').tribe).toBe('Levi')
    expect(trophyForSeason('dezembro de 2026').tribe).toBe('Benjamim')
  })
})

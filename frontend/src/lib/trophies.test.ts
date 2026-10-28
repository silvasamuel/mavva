import { describe, expect, it } from 'vitest'
import { MONTH_TROPHIES, trophyForSeason } from './trophies'

describe('month trophies', () => {
  it('has twelve distinct trophies, one stone each', () => {
    expect(MONTH_TROPHIES).toHaveLength(12)
    expect(new Set(MONTH_TROPHIES.map((t) => t.stone)).size).toBe(12)
    expect(new Set(MONTH_TROPHIES.map((t) => t.gem.join())).size).toBe(12)
  })

  it('picks the trophy from the season name', () => {
    expect(trophyForSeason('setembro de 2026')).toMatchObject({ short: 'SET', stone: 'Ametista' })
    expect(trophyForSeason('Março de 2027').stone).toBe('Carbúnculo')
    expect(trophyForSeason('dezembro de 2026').stone).toBe('Jaspe')
  })
})

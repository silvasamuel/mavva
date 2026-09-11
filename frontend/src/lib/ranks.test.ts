import { describe, expect, it } from 'vitest'
import { nextRankCopy, rankFromLevel, rankLadderIndex, rankProgress } from './ranks'

describe('rankFromLevel', () => {
  it('keeps five levels per band', () => {
    expect(rankFromLevel(1).code).toBe('semente')
    expect(rankFromLevel(5).code).toBe('semente')
    expect(rankFromLevel(6).code).toBe('broto')
    expect(rankFromLevel(10).code).toBe('broto')
    expect(rankFromLevel(11).code).toBe('espiga')
    expect(rankFromLevel(31).code).toBe('celeiro')
    expect(rankFromLevel(80).code).toBe('celeiro')
  })

  it('leaves celeiro open-ended', () => {
    expect(rankFromLevel(31).maxLevel).toBeNull()
  })

  it('places semente first and celeiro last on the ladder', () => {
    expect(rankLadderIndex('semente')).toBe(0)
    expect(rankLadderIndex('celeiro')).toBe(6)
  })
})

describe('rankProgress', () => {
  it('counts levels left inside the current band', () => {
    expect(rankProgress(6, 6, 11)).toEqual({ current: 0, total: 5, remaining: 5 })
    expect(rankProgress(10, 6, 11)).toEqual({ current: 4, total: 5, remaining: 1 })
    expect(rankProgress(31, 31, null)).toEqual({ current: 1, total: 1, remaining: 0 })
  })
})

describe('nextRankCopy', () => {
  it('names the next elo and how many levels remain', () => {
    expect(nextRankCopy(1, 'Espiga')).toBe('Falta 1 nível para Espiga')
    expect(nextRankCopy(5, 'Espiga')).toBe('Faltam 5 níveis para Espiga')
    expect(nextRankCopy(0, null)).toBe('Você chegou ao elo mais alto')
  })
})

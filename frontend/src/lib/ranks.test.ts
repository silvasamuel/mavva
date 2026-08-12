import { describe, expect, it } from 'vitest'
import { rankFromLevel } from './ranks'

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
})

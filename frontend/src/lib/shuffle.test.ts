import { describe, expect, it } from 'vitest'
import { seededShuffle } from './shuffle'

const ITEMS = ['A', 'B', 'C', 'D']

describe('seededShuffle', () => {
  it('is deterministic for the same seed', () => {
    expect(seededShuffle(ITEMS, 'session-1:question-1')).toEqual(
      seededShuffle(ITEMS, 'session-1:question-1')
    )
  })

  it('returns a permutation of the input without mutating it', () => {
    const original = [...ITEMS]
    const shuffled = seededShuffle(ITEMS, 'any-seed')
    expect([...shuffled].sort()).toEqual([...ITEMS].sort())
    expect(ITEMS).toEqual(original)
  })

  it('produces different orders across sessions (statistically)', () => {
    const orders = new Set(
      Array.from({ length: 50 }, (_, i) => seededShuffle(ITEMS, `session-${i}:q`).join(''))
    )
    expect(orders.size).toBeGreaterThan(5)
  })

  it('does not leave the first item fixed across seeds', () => {
    const firsts = new Set(
      Array.from({ length: 50 }, (_, i) => seededShuffle(ITEMS, `session-${i}:q`)[0])
    )
    // The originally-first item (the correct answer in seed data) must move around.
    expect(firsts.size).toBeGreaterThan(1)
  })
})

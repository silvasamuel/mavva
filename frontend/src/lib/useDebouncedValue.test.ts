import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('only settles after the delay, collapsing rapid changes', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 400), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBe('a')

    // Rapid typing: a -> ab -> abc, each within the window.
    rerender({ value: 'ab' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'abc' })
    act(() => vi.advanceTimersByTime(399))
    expect(result.current).toBe('a') // still the initial value — nothing settled

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('abc') // one settle for three keystrokes
  })
})

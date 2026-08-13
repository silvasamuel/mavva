import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEmailCooldown } from './useEmailCooldown'

describe('useEmailCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('counts down and then allows another send', () => {
    const { result } = renderHook(() => useEmailCooldown('verify', 'samuel@teste.com'))
    expect(result.current.remaining).toBe(0)

    act(() => result.current.start(60))
    expect(result.current.remaining).toBe(60)

    act(() => vi.advanceTimersByTime(59_000))
    expect(result.current.remaining).toBeGreaterThan(0)

    act(() => vi.advanceTimersByTime(1_250))
    expect(result.current.remaining).toBe(0)
  })

  it('remembers the wait across remounts', () => {
    const { result, unmount } = renderHook(() => useEmailCooldown('verify', 'samuel@teste.com'))
    act(() => result.current.start(30))
    unmount()

    const again = renderHook(() => useEmailCooldown('verify', 'samuel@teste.com'))
    expect(again.result.current.remaining).toBeGreaterThan(0)
    expect(again.result.current.remaining).toBeLessThanOrEqual(30)
  })
})

import { describe, expect, it } from 'vitest'
import { readTrackingChoice, writeTrackingChoice } from './trackingConsent'

describe('trackingConsent', () => {
  it('starts empty and remembers the choice', () => {
    localStorage.clear()
    expect(readTrackingChoice()).toBeNull()
    writeTrackingChoice('essential')
    expect(readTrackingChoice()).toBe('essential')
    writeTrackingChoice('accepted')
    expect(readTrackingChoice()).toBe('accepted')
  })
})

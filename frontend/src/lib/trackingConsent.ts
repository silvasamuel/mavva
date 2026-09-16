export type TrackingChoice = 'accepted' | 'essential'

const KEY = 'mavva:analytics-consent'

export function readTrackingChoice(): TrackingChoice | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(KEY)
  return value === 'accepted' || value === 'essential' ? value : null
}

export function writeTrackingChoice(choice: TrackingChoice) {
  window.localStorage.setItem(KEY, choice)
}

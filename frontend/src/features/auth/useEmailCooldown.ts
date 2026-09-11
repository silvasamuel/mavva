import { useCallback, useEffect, useState } from 'react'

function storageKey(kind: string, email: string) {
  return `mavva:email-cooldown:${kind}:${email.trim().toLowerCase()}`
}

function readUntil(kind: string, email: string): number {
  if (!email.trim()) return 0
  const raw = sessionStorage.getItem(storageKey(kind, email))
  const until = raw ? Number(raw) : 0
  return Number.isFinite(until) ? until : 0
}

/** Counts down seconds until the user can request another auth e-mail. */
export function useEmailCooldown(kind: 'verify' | 'reset', email: string) {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setUntil(readUntil(kind, email))
  }, [kind, email])

  useEffect(() => {
    if (until <= Date.now()) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [until])

  const remaining = Math.max(0, Math.ceil((until - now) / 1000))

  const start = useCallback(
    (seconds: number) => {
      const next = Date.now() + seconds * 1000
      if (email.trim()) sessionStorage.setItem(storageKey(kind, email), String(next))
      setUntil(next)
      setNow(Date.now())
    },
    [kind, email]
  )

  return { remaining, start }
}

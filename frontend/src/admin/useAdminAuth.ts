import { useCallback, useEffect, useState } from 'react'
import { api, setAccessToken, tryRefresh, API_URL } from '@/lib/api'
import type { TokenResponse, User } from '@/types/api'

type Status = 'loading' | 'anonymous' | 'forbidden' | 'admin'

/**
 * Auth for the isolated admin bundle. Access still hinges on the backend:
 * every /admin API call is 403 unless the signed JWT belongs to an admin.
 * This hook only decides what to render — it grants no privilege by itself.
 */
export function useAdminAuth() {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)

  const resolve = useCallback((me: User | null) => {
    if (!me) return setStatus('anonymous')
    setUser(me)
    setStatus(me.role === 'admin' ? 'admin' : 'forbidden')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await tryRefresh()
      if (!ok) return !cancelled && setStatus('anonymous')
      try {
        const me = await api.get<User>('/users/me')
        if (!cancelled) resolve(me)
      } catch {
        if (!cancelled) setStatus('anonymous')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolve])

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<TokenResponse>('/auth/login', { email, password })
      setAccessToken(data.access_token)
      resolve(data.user)
    },
    [resolve]
  )

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' })
    } finally {
      setAccessToken(null)
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  return { status, user, login, logout }
}

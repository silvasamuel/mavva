import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, setAccessToken, setOnSessionExpired, tryRefresh, API_URL } from '@/lib/api'
import type { TokenResponse, User } from '@/types/api'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await tryRefresh()
      if (ok) {
        try {
          const me = await api.get<User>('/users/me')
          if (!cancelled) setUser(me)
        } catch {
          /* stale session */
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setOnSessionExpired(() => {
      setUser(null)
      setAccessToken(null)
    })
    return () => setOnSessionExpired(null)
  }, [])

  const applyTokens = useCallback((data: TokenResponse) => {
    setAccessToken(data.access_token)
    setUser(data.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      applyTokens(await api.post<TokenResponse>('/auth/login', { email, password }))
    },
    [applyTokens]
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      applyTokens(await api.post<TokenResponse>('/auth/register', { name, email, password }))
    },
    [applyTokens]
  )

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' })
    } finally {
      setAccessToken(null)
      setUser(null)
      queryClient.clear()
    }
  }, [queryClient])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser: setUser }),
    [user, loading, login, register, logout]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + hook belong together
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

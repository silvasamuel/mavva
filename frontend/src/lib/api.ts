// Fetch wrapper: injects the in-memory access token and, on a 401, tries a single
// cookie-based refresh (queueing concurrent requests) before giving up.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setOnSessionExpired(handler: (() => void) | null) {
  onSessionExpired = handler
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) return false
      const data = await response.json()
      accessToken = data.access_token
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body != null) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request<T>(path, options, true)
    onSessionExpired?.()
    throw new ApiError(401, 'Sessão expirada. Entre novamente.')
  }

  if (!response.ok) {
    let message = 'Algo deu errado. Tente novamente.'
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
}

export { API_URL, tryRefresh }

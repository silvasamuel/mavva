// Fetch wrapper: injects the in-memory access token and, on a 401, tries a
// cookie-based refresh (queueing concurrent requests) before giving up.
// Transient 502/503/504 (typical of a Render restart) are retried and never
// treated as a logged-out session.

const TRANSIENT_STATUS = new Set([502, 503, 504])
const MAX_ATTEMPTS = 10
const NETWORK_ATTEMPTS = 3
const BACKOFF_CAP_MS = 4000

/** Same-origin (`''`) on a custom domain; never call mavva.vercel.app from mavva.com.br. */
export function resolveApiUrl(
  configured: string | undefined,
  currentOrigin: string,
  isProd: boolean
): string {
  const trimmed = configured?.replace(/\/$/, '')
  if (!trimmed) return isProd ? '' : 'http://localhost:8000'
  try {
    const target = new URL(trimmed, currentOrigin)
    const here = new URL(currentOrigin)
    if (target.origin === here.origin) return ''
    if (target.hostname.endsWith('.vercel.app') && here.hostname !== target.hostname) {
      return ''
    }
  } catch {
    return trimmed
  }
  return trimmed
}

const API_URL = resolveApiUrl(
  import.meta.env.VITE_API_URL,
  typeof window === 'undefined' ? 'http://localhost:8000' : window.location.origin,
  import.meta.env.PROD
)

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

export type RefreshResult = 'ok' | 'expired' | 'unavailable'

let refreshPromise: Promise<RefreshResult> | null = null

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoff(attempt: number) {
  return Math.min(BACKOFF_CAP_MS, 400 * 2 ** attempt)
}

async function tryRefresh(): Promise<RefreshResult> {
  refreshPromise ??= (async () => {
    let sawUnavailable = false
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (TRANSIENT_STATUS.has(response.status)) {
          sawUnavailable = true
          await delay(backoff(attempt))
          continue
        }
        if (response.status === 401 || response.status === 403) return 'expired'
        if (!response.ok) {
          sawUnavailable = true
          await delay(backoff(attempt))
          continue
        }
        const data = await response.json()
        accessToken = data.access_token
        return 'ok'
      } catch {
        sawUnavailable = true
        if (attempt + 1 >= NETWORK_ATTEMPTS) break
        await delay(backoff(attempt))
      }
    }
    return sawUnavailable ? 'unavailable' : 'expired'
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body != null) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    if (attempt < NETWORK_ATTEMPTS - 1) {
      await delay(backoff(attempt))
      return request<T>(path, options, attempt + 1)
    }
    throw new ApiError(0, 'Sem conexão. Tente novamente.')
  }

  if (response.status === 401 && attempt === 0 && !path.startsWith('/auth/')) {
    const refresh = await tryRefresh()
    if (refresh === 'ok') return request<T>(path, options, 1)
    if (refresh === 'unavailable') {
      throw new ApiError(503, 'Servidor reiniciando. Tente de novo em alguns segundos.')
    }
    onSessionExpired?.()
    throw new ApiError(401, 'Sessão expirada. Entre novamente.')
  }

  if (TRANSIENT_STATUS.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
    await delay(backoff(attempt))
    return request<T>(path, options, attempt + 1)
  }

  if (!response.ok) {
    let message = 'Algo deu errado. Tente novamente.'
    if (TRANSIENT_STATUS.has(response.status)) {
      message = 'Servidor reiniciando. Tente de novo em alguns segundos.'
    }
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export { API_URL, tryRefresh }

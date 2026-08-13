import { describe, expect, it } from 'vitest'
import { resolveApiUrl } from './api'

describe('resolveApiUrl', () => {
  it('uses localhost in development when unset', () => {
    expect(resolveApiUrl(undefined, 'http://localhost:5173', false)).toBe('http://localhost:8000')
  })

  it('uses same-origin in production when unset', () => {
    expect(resolveApiUrl(undefined, 'https://mavva.com.br', true)).toBe('')
  })

  it('stays same-origin when the configured host matches the page', () => {
    expect(
      resolveApiUrl('https://mavva.vercel.app', 'https://mavva.vercel.app', true)
    ).toBe('')
  })

  it('does not call the Vercel host from the custom domain', () => {
    expect(resolveApiUrl('https://mavva.vercel.app', 'https://mavva.com.br', true)).toBe('')
  })

  it('keeps an explicit non-Vercel API host', () => {
    expect(
      resolveApiUrl('https://mavva-api.onrender.com', 'https://mavva.com.br', true)
    ).toBe('https://mavva-api.onrender.com')
  })
})

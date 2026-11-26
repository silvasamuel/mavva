/** Where an invite opened before signing in waits until the player is in. */
const PENDING_KEY = 'mavva:league-invite'

export function inviteUrl(code: string): string {
  return `${window.location.origin}/leagues/join/${code}`
}

export function rememberInvite(code: string): void {
  try {
    localStorage.setItem(PENDING_KEY, code)
  } catch {
    // Private mode: the guest just has to open the link again after signing in.
  }
}

/** Reads the waiting invite and forgets it, so it is redeemed only once. */
export function takePendingInvite(): string | null {
  try {
    const code = localStorage.getItem(PENDING_KEY)
    if (code) localStorage.removeItem(PENDING_KEY)
    return code
  } catch {
    return null
  }
}

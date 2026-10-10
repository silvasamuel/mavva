import { useEffect } from 'react'
import { api } from '@/lib/api'
import type { User } from '@/types/api'
import { useAuth } from '@/features/auth/AuthContext'
import { TutorialDialog } from './TutorialDialog'

// Marks a player who closed the tutorial while the server couldn't be reached:
// on their next visit it's saved again in the background instead of shown again.
function pendingKey(userId: string) {
  return `mavva:tutorial-pending:${userId}`
}

function isPending(userId: string): boolean {
  try {
    return window.localStorage.getItem(pendingKey(userId)) === '1'
  } catch {
    return false
  }
}

function setPending(userId: string, pending: boolean) {
  try {
    if (pending) window.localStorage.setItem(pendingKey(userId), '1')
    else window.localStorage.removeItem(pendingKey(userId))
  } catch {
    // Storage blocked (private mode): the tutorial just shows again next visit.
  }
}

/** Opens the tutorial over the shell until the player finishes or skips it once. */
export function FirstLoginTutorial() {
  const { user, updateUser } = useAuth()
  const userId = user?.id
  const needsTutorial = user?.tutorial_completed === false
  const retry = needsTutorial && isPending(user.id)

  useEffect(() => {
    if (!userId || !retry) return
    let cancelled = false
    void api.post<User>('/users/me/tutorial').then(
      (updated) => {
        // Unmounted (logout, or the shell remounting on navigation): the next
        // mount retries — the endpoint is idempotent.
        if (cancelled) return
        setPending(userId, false)
        updateUser(updated)
      },
      () => {
        // Still unreachable: try again next visit, without showing it again.
      }
    )
    return () => {
      cancelled = true
    }
  }, [userId, retry, updateUser])

  function finish() {
    if (!user) return
    // Close at once on every path, so a slow or failed request never traps
    // the player; the cached user keeps it closed for the rest of the session.
    updateUser({ ...user, tutorial_completed: true })
    void api.post<User>('/users/me/tutorial').then(
      () => setPending(user.id, false),
      () => setPending(user.id, true)
    )
  }

  return (
    <TutorialDialog
      open={needsTutorial && !retry}
      onClose={finish}
      firstName={user?.name.split(' ')[0]}
    />
  )
}

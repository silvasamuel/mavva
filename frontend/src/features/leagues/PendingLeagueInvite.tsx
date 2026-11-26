import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { takePendingInvite } from './inviteLink'

/**
 * An invite link opened before signing in leaves its code behind. Once the
 * player is in (login or first sign-up), this redeems it and takes them to
 * the invitation. Renders nothing.
 */
export function PendingLeagueInvite() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    const code = takePendingInvite()
    if (!code) return
    api
      .post<{ league_id: string }>(`/leagues/invite/${code}/redeem`)
      .then(({ league_id }) => {
        void queryClient.invalidateQueries({ queryKey: ['leagues'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        navigate(`/leagues/${league_id}`)
      })
      .catch(() => {
        // The league started or filled up meanwhile: nothing to land on.
      })
  }, [navigate, queryClient])

  return null
}

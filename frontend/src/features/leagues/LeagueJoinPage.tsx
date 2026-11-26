import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { LeagueInvitePreview } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate } from '@/lib/format'
import { rememberInvite } from './inviteLink'
import { FORMAT_LABEL } from './labels'

/**
 * Where the invite link lands. Signed in: the link becomes an invitation and
 * the player goes straight to it. Not signed in: the league is shown, the
 * code is kept, and the invitation is waiting right after sign-up or login.
 */
export function LeagueJoinPage() {
  const { code = '' } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const preview = useQuery({
    queryKey: ['league-invite', code],
    queryFn: () => api.get<LeagueInvitePreview>(`/leagues/invite/${code}`),
    retry: false,
  })
  const redeem = useMutation({
    mutationFn: () => api.post<{ league_id: string }>(`/leagues/invite/${code}/redeem`),
    onSuccess: ({ league_id }) => navigate(`/leagues/${league_id}`, { replace: true }),
  })
  const redeemed = useRef(false)
  const open = preview.data?.open === true

  useEffect(() => {
    if (loading || !open) return
    if (!user) {
      rememberInvite(code)
      return
    }
    if (redeemed.current) return
    redeemed.current = true
    redeem.mutate()
  }, [loading, user, open, code, redeem])

  const league = preview.data
  const failure = redeem.error ?? preview.error

  return (
    <AuthLayout title="Convite para uma liga" robots="noindex">
      {loading || preview.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : !league ? (
        <div className="space-y-4 text-center">
          <p className="font-semibold text-sand-600">
            {failure instanceof ApiError && failure.status === 404
              ? 'Este link de convite não existe mais.'
              : 'Não foi possível abrir o convite. Tente de novo em instantes.'}
          </p>
          <Link to="/">
            <Button variant="secondary">Ir para o Mavva</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-5 text-center">
          <div>
            <p className="text-sm font-semibold text-sand-500">
              {league.admin_name} (@{league.admin_username}) convidou você para
            </p>
            <p className="mt-1 break-words text-2xl font-extrabold text-ink">{league.name}</p>
            <p className="mt-1 text-sm font-semibold text-sand-500">
              {FORMAT_LABEL[league.format]} · {league.member_count} de {league.max_members}{' '}
              jogadores · até {formatDate(league.ends_on)}
            </p>
            <p className="text-xs font-semibold text-sand-400">
              {league.question_count} perguntas por partida, {league.timer_seconds} s cada
            </p>
          </div>

          {!league.open ? (
            <p className="rounded-2xl bg-sand-100 px-4 py-3 text-sm font-semibold text-sand-600">
              {league.status === 'recruiting'
                ? 'Esta liga já está cheia.'
                : 'Esta liga já começou: não dá mais para entrar.'}
            </p>
          ) : user ? (
            redeem.isError ? (
              <p role="alert" className="text-sm font-bold text-red-600">
                {failure instanceof ApiError
                  ? failure.message
                  : 'Não foi possível abrir o convite.'}
              </p>
            ) : (
              <div className="flex justify-center py-2">
                <Spinner className="h-6 w-6 text-leaf-500" />
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Link to="/register" className="block">
                <Button full>Criar conta e ver o convite</Button>
              </Link>
              <Link to="/login" className="block">
                <Button full variant="secondary">
                  Já tenho conta
                </Button>
              </Link>
              <p className="text-xs font-semibold text-sand-500">
                Depois de entrar, o convite estará esperando por você.
              </p>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  )
}

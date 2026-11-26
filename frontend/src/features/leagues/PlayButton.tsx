import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { AppIcons, Glyph } from '@/lib/icons'

/**
 * Opens the player's session for a league fixture. Players who aren't
 * supporters can see everything but not play: they get the way to become one.
 */
export function PlayButton({
  leagueId,
  matchId,
  canPlay,
  label = 'Jogar',
  full = false,
}: {
  leagueId: string
  matchId: string
  canPlay: boolean
  label?: string
  full?: boolean
}) {
  const navigate = useNavigate()
  const play = useMutation({
    mutationFn: () =>
      api.post<{ session_id: string }>(`/leagues/${leagueId}/matches/${matchId}/play`),
    onSuccess: ({ session_id }) => navigate(`/quiz/${session_id}`),
  })

  if (!canPlay) {
    return (
      <Link to="/apoie" className={full ? 'block' : 'inline-block'}>
        <Button variant="gold" full={full}>
          <Glyph as={AppIcons.heart} className="h-4 w-4" />
          Apoie para jogar
        </Button>
      </Link>
    )
  }
  return (
    <div className={full ? 'w-full' : ''}>
      <Button full={full} loading={play.isPending} onClick={() => play.mutate()}>
        {label}
      </Button>
      {play.isError && (
        <p role="alert" className="mt-2 text-sm font-bold text-red-600">
          {play.error instanceof ApiError
            ? play.error.message
            : 'Não foi possível abrir a partida.'}
        </p>
      )}
    </div>
  )
}

/** The notice players without an active seal see at the top of league screens. */
export function SupporterNotice() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-3xl border-2 border-grain-300 bg-grain-50 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-grain-100 text-grain-700">
        <Glyph as={AppIcons.heart} className="h-6 w-6" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-semibold text-sand-700">
        <strong className="block font-extrabold text-ink">
          As ligas são para Mavva Apoiadores
        </strong>
        Você pode acompanhar tudo por aqui. Para criar uma liga, aceitar convites e jogar, apoie o
        Mavva.
      </p>
      <Link to="/apoie">
        <Button variant="gold" size="sm">
          Apoiar o Mavva
        </Button>
      </Link>
    </div>
  )
}

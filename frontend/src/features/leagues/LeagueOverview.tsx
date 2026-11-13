import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { LeagueDetail } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { RankBadge } from '@/components/RankBadge'
import { DIFFICULTY_LABELS, formatDate } from '@/lib/format'
import { AppIcons, CategoryGlyph, Glyph } from '@/lib/icons'
import { useLeague } from './useLeague'
import { PlayButton } from './PlayButton'
import { FORMAT_LABEL } from './labels'

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/** What starting needs, in the owner's words; null when the league is ready. */
function startBlocker(league: LeagueDetail): string | null {
  if (league.member_count < 2) return 'Convide pelo menos mais um jogador para começar.'
  if (league.format === 'cup' && league.member_count % 2 === 1) {
    return 'A copa precisa de um número par de jogadores: convide mais um ou remova alguém.'
  }
  return null
}

function Invitation({ league }: { league: LeagueDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const join = useMutation({
    mutationFn: () => api.post<LeagueDetail>(`/leagues/${league.id}/join`),
    onSuccess: (updated) => {
      queryClient.setQueryData(['league', league.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  const decline = useMutation({
    mutationFn: () => api.post<void>(`/leagues/${league.id}/decline`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/leagues', { replace: true })
    },
  })
  const failure = join.error ?? decline.error
  return (
    <Card className="ring-2 ring-grain-300">
      <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">Convite</p>
      <p className="mt-1 font-extrabold text-ink">
        @{league.owner.username} convidou você para esta liga
      </p>
      <p className="mt-1 text-sm font-semibold text-sand-500">
        Aceite para entrar. Depois que a liga começar, ninguém mais entra.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {league.can_play ? (
          <Button loading={join.isPending} onClick={() => join.mutate()}>
            Aceitar convite
          </Button>
        ) : (
          <Link to="/apoie">
            <Button variant="gold">
              <Glyph as={AppIcons.heart} className="h-4 w-4" />
              Apoie para entrar
            </Button>
          </Link>
        )}
        <Button variant="secondary" loading={decline.isPending} onClick={() => decline.mutate()}>
          Recusar
        </Button>
      </div>
      {failure && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-600">
          {errorText(failure, 'Não foi possível responder ao convite.')}
        </p>
      )}
    </Card>
  )
}

function OwnerControls({ league }: { league: LeagueDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const start = useMutation({
    mutationFn: () => api.post<LeagueDetail>(`/leagues/${league.id}/start`),
    onSuccess: (updated) => {
      queryClient.setQueryData(['league', league.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(`/leagues/${league.id}/games`)
    },
  })
  const remove = useMutation({
    mutationFn: () => api.delete<void>(`/leagues/${league.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      navigate('/leagues', { replace: true })
    },
  })
  const blocker = startBlocker(league)
  const failure = start.error ?? remove.error
  return (
    <Card className="space-y-3">
      <CardTitle>Começar a liga</CardTitle>
      <p className="text-sm font-semibold text-sand-600">
        {blocker ??
          (league.format === 'cup'
            ? 'Ao começar, o chaveamento é sorteado e ninguém mais entra. Convites sem resposta são cancelados.'
            : 'Ao começar, as rodadas são sorteadas e ninguém mais entra. Convites sem resposta são cancelados.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={blocker != null} loading={start.isPending} onClick={() => start.mutate()}>
          Começar agora
        </Button>
        <Link to="players">
          <Button variant="secondary">Convidar jogadores</Button>
        </Link>
        {confirmDelete ? (
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Confirmar: apagar a liga
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Apagar liga
          </Button>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-sm font-bold text-red-600">
          {errorText(failure, 'Não foi possível concluir.')}
        </p>
      )}
    </Card>
  )
}

function Outcome({ league }: { league: LeagueDetail }) {
  if (league.status === 'finished' && league.champion) {
    return (
      <Card className="flex items-center gap-4 bg-gradient-to-br from-grain-50 to-white ring-2 ring-grain-300">
        <span className="relative shrink-0">
          <RankBadge code={league.champion.rank.code} size="lg" />
          <Glyph as={AppIcons.crown} className="absolute -right-2 -top-3 h-7 w-7 text-grain-500" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-grain-700">
            Campeão da liga
          </p>
          <p className="truncate text-xl font-extrabold text-ink">{league.champion.name}</p>
          <p className="text-sm font-semibold text-sand-500">@{league.champion.username}</p>
        </div>
      </Card>
    )
  }
  if (league.status === 'incomplete') {
    return (
      <Card className="ring-2 ring-red-100">
        <p className="font-extrabold text-ink">Liga não completada</p>
        <p className="mt-1 text-sm font-semibold text-sand-500">
          {league.started_at == null
            ? 'A data de encerramento chegou antes de a liga começar.'
            : league.format === 'cup'
              ? 'A data de encerramento chegou antes de todos os duelos serem jogados, então não houve campeão.'
              : 'A data de encerramento chegou sem ninguém ter jogado.'}
        </p>
      </Card>
    )
  }
  return null
}

export function LeagueOverview() {
  const league = useLeague()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const leave = useMutation({
    mutationFn: () => api.post<void>(`/leagues/${league.id}/leave`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      navigate('/leagues', { replace: true })
    },
  })
  const invited = league.my_status === 'invited'
  const recruiting = league.status === 'recruiting'

  return (
    <div className="space-y-4">
      <Outcome league={league} />

      {invited && recruiting && <Invitation league={league} />}

      {league.my_match_id && (
        <Card className="flex flex-wrap items-center gap-3 ring-2 ring-leaf-300">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-wide text-leaf-700">Sua vez</p>
            <p className="font-extrabold text-ink">
              {league.format === 'cup'
                ? 'Seu duelo está esperando'
                : 'Você tem uma rodada para jogar'}
            </p>
            <p className="text-sm font-semibold text-sand-500">
              {league.question_count} perguntas, {league.timer_seconds} segundos cada. Vale até{' '}
              {formatDate(league.ends_on)}.
            </p>
          </div>
          <PlayButton
            leagueId={league.id}
            matchId={league.my_match_id}
            canPlay={league.can_play}
            label="Jogar agora"
          />
        </Card>
      )}

      {recruiting && league.is_owner && <OwnerControls league={league} />}

      {recruiting && !league.is_owner && !invited && (
        <Card className="space-y-3">
          <p className="font-extrabold text-ink">Aguardando o início</p>
          <p className="text-sm font-semibold text-sand-500">
            @{league.owner.username} começa a liga quando todos estiverem dentro.
          </p>
          <Button variant="ghost" loading={leave.isPending} onClick={() => leave.mutate()}>
            Sair da liga
          </Button>
          {leave.isError && (
            <p role="alert" className="text-sm font-bold text-red-600">
              {errorText(leave.error, 'Não foi possível sair.')}
            </p>
          )}
        </Card>
      )}

      <Card className="space-y-4">
        <CardTitle>Regras</CardTitle>
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {[
            ['Formato', FORMAT_LABEL[league.format]],
            [
              league.format === 'cup' ? 'Jogadores' : 'Rodadas',
              league.format === 'cup' ? `${league.member_count}` : `${league.rounds ?? 0}`,
            ],
            ['Por partida', `${league.question_count} perguntas`],
            ['Tempo', `${league.timer_seconds} s cada`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-sand-50 px-2 py-3">
              <dt className="text-[11px] font-extrabold uppercase tracking-wide text-sand-500">
                {label}
              </dt>
              <dd className="text-sm font-extrabold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm font-semibold text-sand-600">
          {league.format === 'cup'
            ? 'Mata-mata em duelos: os dois respondem às mesmas perguntas. Vence quem fizer mais pontos; em caso de empate, quem foi mais rápido. Quem perde está fora.'
            : 'Todos jogam cada rodada com as mesmas perguntas, em ordem. Ganha quem somar mais pontos até a data final; em caso de empate, quem gastou menos tempo.'}{' '}
          Cada acerto vale pela dificuldade: 10, 20, 35 ou 50 pontos. As partidas da liga não dão XP
          de temporada.
        </p>
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sand-500">
            Temas · {league.categories.length}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {league.categories.map((category) => (
              <li
                key={category.id}
                className="inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2.5 py-1 text-xs font-bold text-leaf-800"
              >
                <CategoryGlyph slug={category.slug} emoji={category.icon} className="h-3.5 w-3.5" />
                {category.name}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sand-500">
            Dificuldades
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {league.difficulties.map((difficulty) => (
              <li
                key={difficulty}
                className="rounded-full bg-grain-50 px-2.5 py-1 text-xs font-bold text-grain-800"
              >
                {DIFFICULTY_LABELS[difficulty]}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  )
}

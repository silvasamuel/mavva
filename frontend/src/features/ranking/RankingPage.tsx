import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatPercent, formatSeasonEnd } from '@/lib/format'
import type {
  AccuracyEntry,
  AccuracyLeaderboard,
  FriendsLeaderboard,
  GlobalLeaderboard,
  LeaderboardEntry,
  PublicUser,
  Season,
} from '@/types/api'
import { PlayerProfileModal } from '@/components/PlayerProfileModal'
import { RankBadge } from '@/components/RankBadge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { AppIcons, Glyph } from '@/lib/icons'

type Tab = 'global' | 'friends' | 'accuracy'

function formatXp(xp: number): string {
  return `${xp.toLocaleString('pt-BR')} XP`
}

type OpenPlayer = (user: PublicUser) => void

function SeasonBanner({ season }: { season: Season }) {
  return (
    <section
      aria-label="Temporada"
      className="flex items-start gap-3 rounded-2xl bg-grain-50 px-4 py-3 ring-1 ring-grain-200"
    >
      <Glyph as={AppIcons.season} className="mt-0.5 h-5 w-5 shrink-0 text-grain-600" />
      <div>
        <p className="text-sm font-extrabold text-ink">
          Temporada de {season.name} · {formatSeasonEnd(season.days_left)}
        </p>
        <p className="text-xs font-semibold text-sand-500">
          No dia 1º, XP, nível e o ranking de XP recomeçam. Seu elo da temporada fica no perfil.
        </p>
      </div>
    </section>
  )
}

function PlayerRow({
  position,
  user,
  isMe,
  detail,
  aside,
  onOpen,
}: {
  position: number
  user: PublicUser
  isMe: boolean
  detail: string
  /** Right-hand column, e.g. the accuracy — the name truncates to make room. */
  aside?: ReactNode
  onOpen: OpenPlayer
}) {
  return (
    <li className={isMe ? 'rounded-2xl bg-grain-50 ring-1 ring-grain-200' : ''}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(user)}
        className={`flex w-full items-center gap-3 rounded-2xl py-3 text-left transition-colors hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500 ${
          isMe ? 'px-3 hover:bg-grain-100' : 'px-1'
        }`}
      >
        <span
          className={`w-8 shrink-0 text-right text-sm font-extrabold tabular-nums ${
            position <= 3 ? 'text-grain-700' : 'text-sand-400'
          }`}
        >
          {position}º
        </span>
        <RankBadge code={user.rank.code} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink">
            {isMe ? `Você · @${user.username}` : `@${user.username}`}
          </p>
          <p className="truncate text-xs font-semibold text-sand-500">{detail}</p>
        </div>
        {aside}
      </button>
    </li>
  )
}

function RankRow({ entry, onOpen }: { entry: LeaderboardEntry; onOpen: OpenPlayer }) {
  return (
    <PlayerRow
      position={entry.position}
      user={entry.user}
      isMe={entry.is_me}
      detail={`${entry.user.rank.name} · ${formatXp(entry.total_xp)}`}
      onOpen={onOpen}
    />
  )
}

function AccuracyRow({ entry, onOpen }: { entry: AccuracyEntry; onOpen: OpenPlayer }) {
  return (
    <PlayerRow
      position={entry.position}
      user={entry.user}
      isMe={entry.is_me}
      detail={entry.user.rank.name}
      aside={
        <div className="shrink-0 whitespace-nowrap text-right">
          <p className="font-extrabold tabular-nums text-ink">{formatPercent(entry.accuracy)}</p>
          <p className="text-xs font-semibold tabular-nums text-sand-500">
            {entry.questions_answered.toLocaleString('pt-BR')} respondidas
          </p>
        </div>
      }
      onOpen={onOpen}
    />
  )
}

function OwnPosition({
  position,
  total,
  children,
}: {
  position: number
  total: number
  children: ReactNode
}) {
  return (
    <div className="mt-3 border-t border-dashed border-sand-200 pt-3">
      <p className="mb-1 px-1 text-xs font-extrabold uppercase tracking-wide text-sand-400">
        Sua posição · {position}º de {total}
      </p>
      <ol>{children}</ol>
    </div>
  )
}

function GlobalBoard({ data, onOpen }: { data: GlobalLeaderboard; onOpen: OpenPlayer }) {
  const inTop = data.top.some((row) => row.is_me)
  return (
    <Card>
      <ol className="divide-y divide-sand-100">
        {data.top.map((entry) => (
          <RankRow key={entry.user.id} entry={entry} onOpen={onOpen} />
        ))}
      </ol>
      {!inTop && (
        <OwnPosition position={data.me.position} total={data.total_players}>
          <RankRow entry={data.me} onOpen={onOpen} />
        </OwnPosition>
      )}
    </Card>
  )
}

function FriendsBoard({ data, onOpen }: { data: FriendsLeaderboard; onOpen: OpenPlayer }) {
  const navigate = useNavigate()
  const onlyMe = data.entries.length === 1 && data.entries[0].is_me

  return (
    <Card>
      {onlyMe && (
        <p className="mb-3 text-sm font-semibold text-sand-500">
          Adicione amigos para comparar XP.{' '}
          <button
            type="button"
            onClick={() => navigate('/friends')}
            className="font-bold text-leaf-600 hover:underline"
          >
            Ir para Amigos
          </button>
        </p>
      )}
      <ol className="divide-y divide-sand-100">
        {data.entries.map((entry) => (
          <RankRow key={entry.user.id} entry={entry} onOpen={onOpen} />
        ))}
      </ol>
    </Card>
  )
}

function missingAnswers(missing: number): string {
  return missing === 1
    ? 'Falta 1 resposta para você entrar neste ranking.'
    : `Faltam ${missing.toLocaleString('pt-BR')} respostas para você entrar neste ranking.`
}

function AccuracyBoard({ data, onOpen }: { data: AccuracyLeaderboard; onOpen: OpenPlayer }) {
  const me = data.me
  const inTop = data.top.some((row) => row.is_me)

  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-sand-500">
        Entra quem já respondeu pelo menos {data.min_answers} perguntas.
      </p>
      {data.top.length === 0 ? (
        <p className="py-6 text-center text-sm font-semibold text-sand-500">
          Ninguém entrou neste ranking ainda.
        </p>
      ) : (
        <ol className="divide-y divide-sand-100">
          {data.top.map((entry) => (
            <AccuracyRow key={entry.user.id} entry={entry} onOpen={onOpen} />
          ))}
        </ol>
      )}
      {me && !inTop && (
        <OwnPosition position={me.position} total={data.total_players}>
          <AccuracyRow entry={me} onOpen={onOpen} />
        </OwnPosition>
      )}
      {!me && (
        <p className="mt-3 border-t border-dashed border-sand-200 px-1 pt-3 text-sm font-bold text-ink">
          {missingAnswers(data.min_answers - data.my_answers)}
        </p>
      )}
    </Card>
  )
}

export function RankingPage() {
  const [tab, setTab] = useState<Tab>('global')
  const [openPlayer, setOpenPlayer] = useState<PublicUser | null>(null)

  const global = useQuery({
    queryKey: ['ranking', 'global'],
    queryFn: () => api.get<GlobalLeaderboard>('/ranking/global'),
  })
  const friends = useQuery({
    queryKey: ['ranking', 'friends'],
    queryFn: () => api.get<FriendsLeaderboard>('/ranking/friends'),
  })
  const accuracy = useQuery({
    queryKey: ['ranking', 'accuracy'],
    queryFn: () => api.get<AccuracyLeaderboard>('/ranking/accuracy'),
  })

  const active = { global, friends, accuracy }[tab]

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Ranking</h1>
        <p className="text-sm font-semibold text-sand-500">
          Quem lidera o Mavva em XP e em precisão.
        </p>
      </header>

      {global.data && <SeasonBanner season={global.data.season} />}

      <nav className="flex gap-2" aria-label="Tipo de ranking">
        {(
          [
            ['global', 'Global'],
            ['friends', 'Amigos'],
            ['accuracy', 'Precisão'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-2xl px-4 py-3 text-sm font-extrabold transition-colors ${
              tab === value ? 'bg-leaf-500 text-white' : 'bg-white text-sand-600 shadow-card'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {active.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : tab === 'global' && global.data ? (
        <GlobalBoard data={global.data} onOpen={setOpenPlayer} />
      ) : tab === 'friends' && friends.data ? (
        <FriendsBoard data={friends.data} onOpen={setOpenPlayer} />
      ) : tab === 'accuracy' && accuracy.data ? (
        <AccuracyBoard data={accuracy.data} onOpen={setOpenPlayer} />
      ) : (
        <Card>
          <p className="text-sm font-semibold text-sand-500">Não foi possível carregar o ranking.</p>
          <Button className="mt-3" variant="secondary" onClick={() => void active.refetch()}>
            Tentar de novo
          </Button>
        </Card>
      )}

      <PlayerProfileModal
        userId={openPlayer?.id ?? null}
        preview={openPlayer}
        onClose={() => setOpenPlayer(null)}
      />
    </div>
  )
}

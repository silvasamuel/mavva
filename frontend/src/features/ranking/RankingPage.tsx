import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FriendsLeaderboard, GlobalLeaderboard, LeaderboardEntry } from '@/types/api'
import { PlayerProfileModal } from '@/components/PlayerProfileModal'
import { RankBadge } from '@/components/RankBadge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

type Tab = 'global' | 'friends'

function formatXp(xp: number): string {
  return `${xp.toLocaleString('pt-BR')} XP`
}

type OpenPlayer = (userId: string) => void

function RankRow({ entry, onOpen }: { entry: LeaderboardEntry; onOpen: OpenPlayer }) {
  return (
    <li className={entry.is_me ? 'rounded-2xl bg-grain-50 ring-1 ring-grain-200' : ''}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(entry.user.id)}
        className={`flex w-full items-center gap-3 rounded-2xl py-3 text-left transition-colors hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500 ${
          entry.is_me ? 'px-3 hover:bg-grain-100' : 'px-1'
        }`}
      >
        <span
          className={`w-8 shrink-0 text-right text-sm font-extrabold tabular-nums ${
            entry.position <= 3 ? 'text-grain-700' : 'text-sand-400'
          }`}
        >
          {entry.position}º
        </span>
        <RankBadge code={entry.user.rank.code} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink">
            {entry.is_me ? `Você · @${entry.user.username}` : `@${entry.user.username}`}
          </p>
          <p className="truncate text-xs font-semibold text-sand-500">
            {entry.user.rank.name} · {formatXp(entry.total_xp)}
          </p>
        </div>
      </button>
    </li>
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
        <div className="mt-3 border-t border-dashed border-sand-200 pt-3">
          <p className="mb-1 px-1 text-[10px] font-extrabold uppercase tracking-wide text-sand-400">
            Sua posição · {data.me.position}º de {data.total_players}
          </p>
          <ol>
            <RankRow entry={data.me} onOpen={onOpen} />
          </ol>
        </div>
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

export function RankingPage() {
  const [tab, setTab] = useState<Tab>('global')
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  const global = useQuery({
    queryKey: ['ranking', 'global'],
    queryFn: () => api.get<GlobalLeaderboard>('/ranking/global'),
  })
  const friends = useQuery({
    queryKey: ['ranking', 'friends'],
    queryFn: () => api.get<FriendsLeaderboard>('/ranking/friends'),
  })

  const loading = tab === 'global' ? global.isLoading || !global.data : friends.isLoading || !friends.data

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Ranking</h1>
        <p className="text-sm font-semibold text-sand-500">Quem tem mais XP no Mavva.</p>
      </header>

      <nav className="flex gap-2" aria-label="Tipo de ranking">
        {(
          [
            ['global', 'Global'],
            ['friends', 'Amigos'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-2xl px-4 py-2 text-sm font-extrabold transition-colors ${
              tab === value ? 'bg-leaf-500 text-white' : 'bg-white text-sand-600 shadow-card'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : tab === 'global' && global.data ? (
        <GlobalBoard data={global.data} onOpen={setOpenPlayer} />
      ) : friends.data ? (
        <FriendsBoard data={friends.data} onOpen={setOpenPlayer} />
      ) : (
        <Card>
          <p className="text-sm font-semibold text-sand-500">Não foi possível carregar o ranking.</p>
          <Button className="mt-3" variant="secondary" onClick={() => void global.refetch()}>
            Tentar de novo
          </Button>
        </Card>
      )}

      <PlayerProfileModal userId={openPlayer} onClose={() => setOpenPlayer(null)} />
    </div>
  )
}

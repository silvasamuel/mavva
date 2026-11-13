import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { FriendsOverview, LeagueDetail, PublicUser } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { PlayerProfileModal } from '@/components/PlayerProfileModal'
import { PlayerSeals } from '@/components/PlayerSeals'
import { RankBadge } from '@/components/RankBadge'
import { AppIcons, Glyph } from '@/lib/icons'
import { useLeague } from './useLeague'

/** Past this many friends the list gets a filter box. */
const FILTER_FROM = 8

/**
 * The player's friends, each with where they stand in this league: already
 * in, invited, or one tap away from an invite.
 */
function FriendPicker({
  friends,
  league,
  inviting,
  onInvite,
}: {
  friends: PublicUser[] | undefined
  league: LeagueDetail
  /** Username whose invite is being sent right now. */
  inviting: string | undefined
  onInvite: (friend: PublicUser) => void
}) {
  const [filter, setFilter] = useState('')
  const status = new Map(league.members.map((member) => [member.user.id, member.status]))
  const term = filter.trim().toLowerCase().replace(/^@/, '')
  const shown = (friends ?? []).filter(
    (friend) =>
      term === '' || friend.username.includes(term) || friend.name.toLowerCase().includes(term)
  )

  return (
    <div id="league-friends" className="mt-3 rounded-2xl bg-sand-50 p-3">
      {friends == null ? (
        <div className="flex justify-center py-4">
          <Spinner className="h-6 w-6 text-leaf-500" />
        </div>
      ) : friends.length === 0 ? (
        <p className="text-sm font-semibold text-sand-600">
          Você ainda não tem amigos no Mavva.{' '}
          <Link to="/friends" className="font-extrabold text-leaf-700 hover:underline">
            Adicionar amigos
          </Link>
        </p>
      ) : (
        <>
          {friends.length >= FILTER_FROM && (
            <div className="mb-2">
              <Input
                label="Buscar amigo"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="nome ou usuário"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          )}
          {shown.length === 0 ? (
            <p className="py-2 text-sm font-semibold text-sand-500">Nenhum amigo com esse nome.</p>
          ) : (
            <ul
              aria-label="Seus amigos"
              className="max-h-72 divide-y divide-sand-200 overflow-y-auto"
            >
              {shown.map((friend) => {
                const state = status.get(friend.id)
                return (
                  <li key={friend.id} className="flex items-center gap-3 py-2">
                    <RankBadge code={friend.rank.code} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-extrabold text-ink">
                        <span className="truncate">{friend.name}</span>
                        <PlayerSeals of={friend} />
                      </p>
                      <p className="truncate text-xs font-semibold text-sand-500">
                        @{friend.username}
                      </p>
                    </div>
                    {state === 'active' ? (
                      <span className="shrink-0 rounded-full bg-leaf-100 px-2.5 py-1 text-xs font-extrabold text-leaf-800">
                        Na liga
                      </span>
                    ) : state === 'invited' ? (
                      <span className="shrink-0 rounded-full bg-grain-100 px-2.5 py-1 text-xs font-extrabold text-grain-800">
                        Convidado
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        loading={inviting === friend.username}
                        disabled={inviting != null}
                        aria-label={`Convidar @${friend.username}`}
                        onClick={() => onInvite(friend)}
                      >
                        Convidar
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function InviteForm({ league }: { league: LeagueDetail }) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [friendsOpen, setFriendsOpen] = useState(false)
  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<FriendsOverview>('/friends'),
  })
  const invite = useMutation({
    mutationFn: (handle: string) =>
      api.post<LeagueDetail>(`/leagues/${league.id}/invites`, { username: handle }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['league', league.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      setUsername('')
    },
  })
  const seats = league.max_members - league.member_count - league.invited_count
  const handle = username.trim().toLowerCase().replace(/^@/, '')

  return (
    <Card className="space-y-3">
      <CardTitle>Convidar jogadores</CardTitle>
      {seats <= 0 ? (
        <p className="text-sm font-semibold text-sand-500">
          A liga está cheia: {league.max_members} jogadores, contando os convites pendentes.
        </p>
      ) : (
        <>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (handle.length >= 3) invite.mutate(handle)
            }}
          >
            <div className="min-w-0 flex-1">
              <Input
                label="Nome de usuário"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ex: maria"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <Button type="submit" loading={invite.isPending} disabled={handle.length < 3}>
              Convidar
            </Button>
          </form>
          {invite.isError && (
            <p role="alert" className="text-sm font-bold text-red-600">
              {invite.error instanceof ApiError
                ? invite.error.message
                : 'Não foi possível convidar.'}
            </p>
          )}
          <div>
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={friendsOpen}
              aria-controls="league-friends"
              onClick={() => setFriendsOpen((open) => !open)}
            >
              <Glyph as={AppIcons.friends} className="h-4 w-4" />
              {friendsOpen ? 'Fechar lista de amigos' : 'Ver lista de amigos'}
            </Button>
            {friendsOpen && (
              <FriendPicker
                friends={friends?.friends}
                league={league}
                inviting={invite.isPending ? invite.variables : undefined}
                onInvite={(friend) => invite.mutate(friend.username)}
              />
            )}
          </div>
          <p className="text-xs font-semibold text-sand-500">
            {seats === 1 ? 'Resta 1 vaga' : `Restam ${seats} vagas`} de {league.max_members}. Para
            entrar e jogar, o convidado precisa ser Mavva Apoiador.
          </p>
        </>
      )}
    </Card>
  )
}

/** Who is in, who was invited, and (for the owner, before the start) the invites. */
export function LeaguePlayers() {
  const league = useLeague()
  const queryClient = useQueryClient()
  const [opened, setOpened] = useState<PublicUser | null>(null)
  const canManage = league.is_owner && league.status === 'recruiting'
  const remove = useMutation({
    mutationFn: (userId: string) =>
      api.delete<LeagueDetail>(`/leagues/${league.id}/members/${userId}`),
    onSuccess: (updated) => {
      queryClient.setQueryData(['league', league.id], updated)
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })

  return (
    <div className="space-y-4">
      {canManage && <InviteForm league={league} />}

      <Card>
        <CardTitle>
          Jogadores · {league.member_count}
          {league.invited_count > 0 ? ` (+${league.invited_count} convidados)` : ''}
        </CardTitle>
        <ul className="divide-y divide-sand-100">
          {league.members.map((member) => (
            <li key={member.user.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setOpened(member.user)}
                className="-mx-2 flex min-w-0 flex-1 basis-40 items-center gap-3 rounded-2xl px-2 py-1 text-left transition-colors hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500"
              >
                <RankBadge code={member.user.rank.code} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-extrabold text-ink">
                    <span className="truncate">{member.user.name}</span>
                    <PlayerSeals of={member.user} />
                  </p>
                  <p className="truncate text-xs font-semibold text-sand-500">
                    @{member.user.username}
                  </p>
                </div>
              </button>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {member.is_owner ? (
                  <span className="rounded-full bg-leaf-100 px-2.5 py-1 text-xs font-extrabold text-leaf-800">
                    Admin
                  </span>
                ) : member.status === 'invited' ? (
                  <span className="rounded-full bg-grain-100 px-2.5 py-1 text-xs font-extrabold text-grain-800">
                    Convite pendente
                  </span>
                ) : null}
                {canManage && !member.is_owner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={remove.isPending && remove.variables === member.user.id}
                    onClick={() => remove.mutate(member.user.id)}
                  >
                    {member.status === 'invited' ? 'Cancelar convite' : 'Remover'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {remove.isError && (
          <p role="alert" className="mt-2 text-sm font-bold text-red-600">
            {remove.error instanceof ApiError
              ? remove.error.message
              : 'Não foi possível remover o jogador.'}
          </p>
        )}
      </Card>
      <PlayerProfileModal
        userId={opened?.id ?? null}
        preview={opened}
        onClose={() => setOpened(null)}
      />
    </div>
  )
}

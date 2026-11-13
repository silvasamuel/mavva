import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { FriendsOverview, LeagueDetail, PublicUser } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PlayerProfileModal } from '@/components/PlayerProfileModal'
import { PlayerSeals } from '@/components/PlayerSeals'
import { RankBadge } from '@/components/RankBadge'
import { useLeague } from './useLeague'

function InviteForm({ league }: { league: LeagueDetail }) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
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
  const taken = new Set(league.members.map((member) => member.user.id))
  const suggestions = (friends?.friends ?? []).filter((friend) => !taken.has(friend.id))
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
          {suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sand-500">
                Seus amigos
              </p>
              <ul className="flex flex-wrap gap-2">
                {suggestions.map((friend) => (
                  <li key={friend.id}>
                    <button
                      type="button"
                      disabled={invite.isPending}
                      onClick={() => invite.mutate(friend.username)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-ink shadow-card transition-colors hover:bg-leaf-50 disabled:opacity-50"
                    >
                      <RankBadge code={friend.rank.code} size="xs" />@{friend.username}
                      <span className="text-leaf-700">+</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

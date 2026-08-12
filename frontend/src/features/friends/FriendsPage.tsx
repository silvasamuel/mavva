import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import type { FriendsOverview, PublicUser, UserSearchResult } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { RankBadge } from '@/components/RankBadge'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/features/auth/AuthContext'

function PlayerRow({ user, children }: { user: PublicUser; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <RankBadge code={user.rank.code} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold text-ink">{user.name}</p>
        <p className="truncate text-xs font-semibold text-sand-500">@{user.username}</p>
        <p className="text-xs font-semibold text-sand-400">
          {user.rank.name} · {user.duel_wins}V {user.duel_losses}D {user.duel_draws}E
        </p>
      </div>
      {children}
    </li>
  )
}

export function FriendsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<PublicUser | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get<FriendsOverview>('/friends'),
  })

  const { data: results, isFetching } = useQuery({
    queryKey: ['friends', 'search', debouncedSearch],
    queryFn: () =>
      api.get<UserSearchResult[]>(`/friends/search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.trim().length >= 2,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['friends'] })
    // The pending-request badge lives in the dashboard payload.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const sendRequest = useMutation({
    mutationFn: (username: string) => api.post<{ message: string }>('/friends/requests', { username }),
    onSuccess: (response) => {
      setFeedback(response.message)
      setError('')
      refresh()
    },
    onError: (err) => {
      setFeedback('')
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o pedido.')
    },
  })

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api.post(`/friends/requests/${id}/${accept ? 'accept' : 'decline'}`),
    onSuccess: refresh,
  })

  const removeFriend = useMutation({
    mutationFn: (friendId: string) => api.delete(`/friends/${friendId}`),
    onSuccess: () => {
      setRemoving(null)
      refresh()
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Amigos</h1>
        <p className="text-sm font-semibold text-sand-500">
          Seu nome de usuário é <strong className="text-leaf-700">@{user?.username}</strong> —
          compartilhe para receberem seus desafios.
        </p>
      </header>

      <Card>
        <CardTitle>Encontrar pessoas</CardTitle>
        <Input
          label="Nome de usuário"
          placeholder="ex: samuel"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setFeedback('')
            setError('')
          }}
        />
        {feedback && <p className="mt-2 text-sm font-bold text-leaf-700">{feedback}</p>}
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-red-600">
            {error}
          </p>
        )}

        {debouncedSearch.trim().length >= 2 && (
          <div className="mt-3">
            {isFetching && !results ? (
              <div className="flex justify-center py-6">
                <Spinner className="h-6 w-6 text-leaf-500" />
              </div>
            ) : results && results.length > 0 ? (
              <ul className="divide-y divide-sand-100">
                {results.map(({ user: found, relation }) => (
                  <PlayerRow key={found.id} user={found}>
                    {relation === 'none' ? (
                      <Button
                        variant="secondary"
                        loading={sendRequest.isPending}
                        onClick={() => sendRequest.mutate(found.username)}
                      >
                        Adicionar
                      </Button>
                    ) : (
                      <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-extrabold text-sand-600">
                        {relation === 'friends'
                          ? 'Amigos'
                          : relation === 'pending_sent'
                            ? 'Pedido enviado'
                            : 'Te convidou'}
                      </span>
                    )}
                  </PlayerRow>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm font-semibold text-sand-500">
                Nenhum usuário encontrado.
              </p>
            )}
          </div>
        )}
      </Card>

      {data.incoming.length > 0 && (
        <Card>
          <CardTitle>Pedidos recebidos</CardTitle>
          <ul className="divide-y divide-sand-100">
            {data.incoming.map((request) => (
              <PlayerRow key={request.id} user={request.user}>
                <div className="flex gap-2">
                  <Button
                    onClick={() => respond.mutate({ id: request.id, accept: true })}
                    loading={respond.isPending}
                  >
                    Aceitar
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => respond.mutate({ id: request.id, accept: false })}
                  >
                    Recusar
                  </Button>
                </div>
              </PlayerRow>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>Meus amigos ({data.friends.length})</CardTitle>
        {data.friends.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="Nenhum amigo ainda"
            description="Busque pelo nome de usuário acima para enviar um pedido e começar a duelar."
          />
        ) : (
          <ul className="divide-y divide-sand-100">
            {data.friends.map((friend) => (
              <PlayerRow key={friend.id} user={friend}>
                <button
                  onClick={() => setRemoving(friend)}
                  className="text-xs font-extrabold uppercase text-sand-400 hover:text-red-600"
                >
                  Remover
                </button>
              </PlayerRow>
            ))}
          </ul>
        )}
      </Card>

      {data.sent.length > 0 && (
        <Card>
          <CardTitle>Pedidos enviados</CardTitle>
          <ul className="divide-y divide-sand-100">
            {data.sent.map((request) => (
              <PlayerRow key={request.id} user={request.user}>
                <span className="text-xs font-extrabold uppercase text-sand-400">Aguardando</span>
              </PlayerRow>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={removing != null}
        onClose={() => setRemoving(null)}
        label="Remover amigo"
      >
        {removing && (
          <>
            <p className="text-lg font-extrabold">Remover {removing.name}?</p>
            <p className="text-sm font-semibold text-sand-500">
              @{removing.username} sai da sua lista de amigos. Vocês poderão se adicionar de novo
              depois.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" full onClick={() => setRemoving(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                full
                loading={removeFriend.isPending}
                onClick={() => removeFriend.mutate(removing.id)}
              >
                Remover
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

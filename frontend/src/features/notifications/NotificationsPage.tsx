import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DashboardData, NotificationFeed, NotificationItem } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { formatRelativeDate } from '@/lib/format'
import { AppIcons, Glyph } from '@/lib/icons'
import { ANNOUNCEMENT_KINDS } from './kinds'

function NotificationCard({ item }: { item: NotificationItem }) {
  const kind = ANNOUNCEMENT_KINDS[item.kind]
  return (
    <li>
      <Card className={`flex gap-4 ${item.unread ? 'ring-2 ring-leaf-200' : ''}`}>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${kind.tile}`}
          aria-hidden
        >
          <Glyph as={kind.icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${kind.pill}`}>
              {kind.label}
            </span>
            <time dateTime={item.published_at} className="text-xs font-semibold text-sand-400">
              {formatRelativeDate(item.published_at)}
            </time>
            {item.unread && (
              <span className="ml-auto rounded-full bg-grain-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-grain-900">
                Nova
              </span>
            )}
          </div>
          <h2 className="mt-1.5 font-extrabold leading-snug text-ink">{item.title}</h2>
          <p className="mt-1 whitespace-pre-line text-sm font-semibold text-sand-600">{item.body}</p>
        </div>
      </Card>
    </li>
  )
}

/**
 * "Novidades": what changed in Mavva, newest first. Opening it marks everything
 * as read (the bell badge clears), while the cards keep their "Nova" tag for
 * this visit so the player still sees what was new.
 */
export function NotificationsPage() {
  const queryClient = useQueryClient()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationFeed>('/notifications'),
    // Keep the "Nova" tags for this visit: don't refetch the already-read list.
    staleTime: Infinity,
    gcTime: 0,
  })
  const markedSeen = useRef(false)

  useEffect(() => {
    if (!data || data.unread_count === 0 || markedSeen.current) return
    markedSeen.current = true
    queryClient.setQueryData<DashboardData>(['dashboard'], (current) =>
      current ? { ...current, notifications_unread: 0 } : current
    )
    void api.post('/notifications/seen').catch(() => {
      // Offline or expired: the badge comes back on the next dashboard load.
    })
  }, [data, queryClient])

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Novidades</h1>
        <p className="text-sm font-semibold text-sand-500">O que mudou no Mavva.</p>
      </header>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : isError || !data ? (
        <Card>
          <p className="text-sm font-semibold text-sand-500">Não foi possível carregar as novidades.</p>
          <Button className="mt-3" variant="secondary" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </Card>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Glyph as={AppIcons.bell} className="h-10 w-10" />}
            title="Nada novo por aqui ainda"
            description="Quando o Mavva ganhar algo novo, você fica sabendo aqui."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <NotificationCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

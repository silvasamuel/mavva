import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DashboardData, NotificationFeed, NotificationItem } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/features/auth/AuthContext'
import { Glyph } from '@/lib/icons'
import { ANNOUNCEMENT_KINDS } from './kinds'

/** More than this and the modal turns into a wall of text; the rest wait in "Novidades". */
const MAX_SHOWN = 3

function NewsItem({ item }: { item: NotificationItem }) {
  const kind = ANNOUNCEMENT_KINDS[item.kind]
  return (
    <li className="space-y-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${kind.pill}`}
      >
        <Glyph as={kind.icon} className="h-3.5 w-3.5" />
        {kind.label}
      </span>
      <h3 className="font-extrabold leading-snug text-ink">{item.title}</h3>
      <p className="whitespace-pre-line text-sm font-semibold text-sand-600">{item.body}</p>
    </li>
  )
}

/**
 * Announcements the player hasn't read yet, shown once on the Home right
 * after they are published. It waits its turn behind the tutorial, the podium
 * celebration and the season notice, and closing it marks everything as read
 * (the same thing opening "Novidades" does), so it never comes back for the
 * same news on any device.
 */
export function WhatsNewModal({ data }: { data: DashboardData }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const due =
    data.notifications_unread > 0 &&
    data.season_notice == null &&
    data.podium_celebration == null &&
    user?.tutorial_completed !== false
  const { data: feed } = useQuery({
    queryKey: ['notifications', 'whats-new'],
    queryFn: () => api.get<NotificationFeed>('/notifications'),
    enabled: due,
    staleTime: 0,
  })
  // Kept apart from the query so the card still has its text while it animates closed.
  const [news, setNews] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  // What this visit already showed: a cached feed must never reopen the modal
  // for the same news, only for something published since.
  const dismissed = useRef(new Set<string>())

  useEffect(() => {
    if (!due || !feed || open) return
    const unread = feed.items.filter((item) => item.unread && !dismissed.current.has(item.id))
    if (unread.length === 0) return
    setNews(unread)
    setOpen(true)
  }, [due, feed, open])

  function dismiss(then?: () => void) {
    setOpen(false)
    for (const item of news) dismissed.current.add(item.id)
    queryClient.setQueryData<DashboardData>(['dashboard'], (current) =>
      current ? { ...current, notifications_unread: 0 } : current
    )
    void api.post('/notifications/seen').catch(() => {
      // Offline or expired: it shows again on the next visit, which is harmless.
    })
    then?.()
  }

  const shown = news.slice(0, MAX_SHOWN)
  const hidden = news.length - shown.length

  return (
    <Modal open={open} onClose={() => dismiss()} label="Novidades no Mavva">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-leaf-700">
          {news.length === 1 ? 'Tem novidade no Mavva' : `${news.length} novidades no Mavva`}
        </p>
        <h2 className="mt-1 text-xl font-extrabold leading-tight text-ink">O que há de novo</h2>
      </div>
      <ul className="max-h-[55dvh] space-y-5 overflow-y-auto rounded-2xl bg-sand-50 p-4 text-left">
        {shown.map((item) => (
          <NewsItem key={item.id} item={item} />
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs font-semibold text-sand-500">
          {hidden === 1 ? 'E mais 1 novidade' : `E mais ${hidden} novidades`} na tela de Novidades.
        </p>
      )}
      <div className="space-y-2">
        <Button full onClick={() => dismiss()}>
          Entendi
        </Button>
        <Button full variant="ghost" onClick={() => dismiss(() => navigate('/notifications'))}>
          Ver todas as novidades
        </Button>
      </div>
    </Modal>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/lib/api'
import type { DashboardData } from '@/types/api'
import { Logo } from '@/components/Logo'
import { GameHud } from '@/components/GameHud'
import { useAuth } from '@/features/auth/AuthContext'
import { AppIcons, Glyph, type Icon } from '@/lib/icons'

interface NavItem {
  to: string
  label: string
  icon: Icon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: AppIcons.home },
  { to: '/quiz/new', label: 'Estudar', icon: AppIcons.study },
  { to: '/duels', label: 'Duelos', icon: AppIcons.duels },
  { to: '/review', label: 'Revisar', icon: AppIcons.review },
  { to: '/friends', label: 'Amigos', icon: AppIcons.friends },
  { to: '/ranking', label: 'Ranking', icon: AppIcons.ranking },
  { to: '/achievements', label: 'Conquistas', icon: AppIcons.achievements },
  { to: '/suggest', label: 'Sugerir', icon: AppIcons.suggest },
  { to: '/profile', label: 'Perfil', icon: AppIcons.profile },
]

const MOBILE_TABS: NavItem[] = [
  { to: '/', label: 'Início', icon: AppIcons.home },
  { to: '/quiz/new', label: 'Estudar', icon: AppIcons.study },
  { to: '/duels', label: 'Duelos', icon: AppIcons.duels },
]

const BADGE_PATHS = ['/duels', '/review', '/friends']

const MORE_ITEMS: NavItem[] = [
  { to: '/review', label: 'Revisar', icon: AppIcons.review },
  { to: '/friends', label: 'Amigos', icon: AppIcons.friends },
  { to: '/ranking', label: 'Ranking', icon: AppIcons.ranking },
  { to: '/achievements', label: 'Conquistas', icon: AppIcons.achievements },
  { to: '/suggest', label: 'Sugerir', icon: AppIcons.suggest },
  { to: '/profile', label: 'Perfil', icon: AppIcons.profile },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition-colors ${
    isActive
      ? 'bg-leaf-50 text-leaf-700 ring-2 ring-inset ring-leaf-200'
      : 'text-sand-600 hover:bg-sand-100'
  }`
}

function Badge({ count, loading }: { count: number; loading?: boolean }) {
  if (loading) {
    return (
      <span
        className="ml-auto h-5 w-5 animate-pulse rounded-full bg-sand-200"
        aria-label="Carregando"
      />
    )
  }
  if (count <= 0) return null
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-grain-400 px-1.5 text-[10px] font-extrabold text-grain-900">
      {count}
    </span>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const { data, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })
  const streak = data?.stats.current_streak ?? 0
  const friendRequests = data?.friend_requests ?? 0
  const moreActive = MORE_ITEMS.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  )
  const moreCount = (data?.reviews_due ?? 0) + friendRequests

  useEffect(() => {
    if (!moreOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  function badgeFor(to: string) {
    if (to === '/duels') return data?.duels?.awaiting_me ?? 0
    if (to === '/review') return data?.reviews_due ?? 0
    if (to === '/friends') return friendRequests
    return 0
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative mx-auto flex min-h-screen max-w-6xl">
      {/* Desktop sidebar — also shown on big phones held sideways (768px+
          wide but only ~400px tall), so it scrolls when it doesn't fit. */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-6 overflow-y-auto border-r border-sand-200/60 bg-white/50 px-4 py-6 backdrop-blur-md md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClass}>
              <Glyph as={item.icon} className="h-5 w-5" />
              {item.label}
              <Badge
                count={badgeFor(item.to)}
                loading={isPending && BADGE_PATHS.includes(item.to)}
              />
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-red-600 ring-1 ring-red-100 transition-colors hover:bg-red-100"
        >
          <Glyph as={AppIcons.logout} className="h-5 w-5" />
          Sair
        </button>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10">
        {/* On a phone held sideways the pinned HUD plus the tab bar would eat
            half the screen, so short screens let it scroll away. */}
        <div className="sticky top-0 z-10 -mx-4 mb-4 bg-gradient-to-b from-[#f4efe0]/90 to-transparent px-4 pb-2 pt-2 backdrop-blur-[2px] md:-mx-8 md:px-8 [@media(max-height:500px)]:static">
          <GameHud
            loading={isPending}
            rankCode={data?.stats.rank.code}
            rankName={data?.stats.rank.name}
            level={data?.stats.level}
            xpInto={data?.stats.xp_into_level}
            xpForNext={data?.stats.xp_for_next_level}
            streak={streak}
          />
        </div>
        {children ?? <Outlet />}
      </main>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-sand-200/70 bg-white/80 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
        aria-label="Principal"
      >
        {MOBILE_TABS.map((item) => {
          const count = badgeFor(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-extrabold uppercase ${
                  isActive ? 'text-leaf-600' : 'text-sand-500'
                }`
              }
            >
              <Glyph as={item.icon} className="h-5 w-5" />
              {isPending && item.to === '/duels' ? (
                <span
                  className="absolute right-1 top-0 h-4 w-4 animate-pulse rounded-full bg-sand-200"
                  aria-label="Carregando"
                />
              ) : (
                count > 0 && (
                  <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-grain-400 px-1 text-[10px] font-extrabold text-grain-900">
                    {count}
                  </span>
                )
              )}
              {item.label}
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-extrabold uppercase ${
            moreActive ? 'text-leaf-600' : 'text-sand-500'
          }`}
        >
          <Glyph as={AppIcons.more} className="h-5 w-5" />
          {isPending ? (
            <span
              className="absolute right-1 top-0 h-4 w-4 animate-pulse rounded-full bg-sand-200"
              aria-label="Carregando"
            />
          ) : (
            moreCount > 0 && (
              <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-grain-400 px-1 text-[10px] font-extrabold text-grain-900">
                {moreCount}
              </span>
            )
          )}
          Mais
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Fechar menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-ink/40 md:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Mais"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white/90 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card backdrop-blur-md md:hidden"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-sand-200" />
              <nav className="flex flex-col gap-1" aria-label="Mais">
                {MORE_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={navClass}
                  >
                    <Glyph as={item.icon} className="h-5 w-5" />
                    {item.label}
                    <Badge
                      count={badgeFor(item.to)}
                      loading={isPending && BADGE_PATHS.includes(item.to)}
                    />
                  </NavLink>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

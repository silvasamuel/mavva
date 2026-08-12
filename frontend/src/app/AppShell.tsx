import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DashboardData } from '@/types/api'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/features/auth/AuthContext'

interface NavItem {
  to: string
  label: string
  icon: string
  /** Shown in the mobile bottom bar (space for 5). */
  primary?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: '🏠', primary: true },
  { to: '/quiz/new', label: 'Estudar', icon: '📖', primary: true },
  { to: '/duels', label: 'Duelos', icon: '⚔️', primary: true },
  { to: '/review', label: 'Revisar', icon: '🔁', primary: true },
  { to: '/friends', label: 'Amigos', icon: '🤝' },
  { to: '/achievements', label: 'Conquistas', icon: '🏅' },
  { to: '/profile', label: 'Perfil', icon: '👤', primary: true },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition-colors ${
    isActive
      ? 'bg-leaf-50 text-leaf-700 ring-2 ring-inset ring-leaf-200'
      : 'text-sand-600 hover:bg-sand-100'
  }`
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-grain-400 px-1.5 text-[10px] font-extrabold text-grain-900">
      {count}
    </span>
  )
}

export function AppShell() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })
  const streak = data?.stats.current_streak ?? 0
  const duelsAwaiting = data?.duels?.awaiting_me ?? 0

  function badgeFor(to: string) {
    if (to === '/duels') return duelsAwaiting
    if (to === '/review') return data?.reviews_due ?? 0
    return 0
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-6 border-r border-sand-100 px-4 py-6 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClass}>
              <span aria-hidden>{item.icon}</span>
              {item.label}
              <Badge count={badgeFor(item.to)} />
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 rounded-2xl bg-grain-50 px-4 py-3 ring-1 ring-grain-200">
          <span className="text-2xl" aria-hidden>
            {streak > 0 ? '🔥' : '🪵'}
          </span>
          <div>
            <p className="text-lg font-extrabold leading-none text-grain-700">{streak}</p>
            <p className="text-xs font-bold text-grain-600">
              {streak === 1 ? 'dia seguido' : 'dias seguidos'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-sand-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <span aria-hidden>🚪</span>
          Sair
        </button>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-sand-200 bg-white/95 py-2 backdrop-blur md:hidden"
        aria-label="Principal"
      >
        {NAV_ITEMS.filter((item) => item.primary).map((item) => {
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
              <span className="text-xl" aria-hidden>
                {item.icon}
              </span>
              {count > 0 && (
                <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-grain-400 px-1 text-[9px] font-extrabold text-grain-900">
                  {count}
                </span>
              )}
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

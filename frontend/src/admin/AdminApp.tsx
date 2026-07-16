import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { useAdminAuth } from './useAdminAuth'
import { AdminLogin } from './AdminLogin'
import { UsersPanel } from './UsersPanel'
import { QuestionsPanel } from './QuestionsPanel'
import { PublishBar } from './PublishBar'

type Tab = 'questions' | 'users'

export function AdminApp() {
  const { status, user, login, logout } = useAdminAuth()
  const [tab, setTab] = useState<Tab>('questions')

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <Spinner className="h-8 w-8 text-leaf-400" />
      </div>
    )
  }

  if (status !== 'admin') {
    return <AdminLogin onLogin={login} forbidden={status === 'forbidden'} onLogout={logout} />
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sand-200 bg-white px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-leaf-500 text-sm">
            🔒
          </span>
          <span className="text-lg font-extrabold tracking-tight">mavva · admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-semibold text-sand-500 sm:inline">{user?.email}</span>
          <button
            onClick={logout}
            className="rounded-xl bg-sand-100 px-3 py-1.5 text-xs font-extrabold uppercase text-sand-600 hover:bg-sand-200"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <PublishBar />
        <nav className="mb-6 flex gap-2">
          {(
            [
              ['questions', '📖 Perguntas'],
              ['users', '👥 Usuários'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
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

        {tab === 'questions' ? <QuestionsPanel /> : <UsersPanel />}
      </div>
    </div>
  )
}

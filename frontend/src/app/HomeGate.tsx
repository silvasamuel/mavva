import { useAuth } from '@/features/auth/AuthContext'
import { LandingPage } from '@/features/marketing/LandingPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AppShell } from './AppShell'
import { Spinner } from '@/components/ui/Spinner'

export function HomeGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }
  if (!user) return <LandingPage />
  return (
    <AppShell>
      <DashboardPage />
    </AppShell>
  )
}

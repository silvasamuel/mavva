import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthContext'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { QuizConfigPage } from '@/features/quiz/QuizConfigPage'
import { QuizPlayPage } from '@/features/quiz/QuizPlayPage'
import { QuizSummaryPage } from '@/features/quiz/QuizSummaryPage'
import { ReviewPage } from '@/features/review/ReviewPage'
import { AchievementsPage } from '@/features/achievements/AchievementsPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { AppShell } from './AppShell'
import { RequireAuth } from './RequireAuth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<RequireAuth />}>
              {/* Quiz play is fullscreen-focused, outside the shell */}
              <Route path="/quiz/:sessionId" element={<QuizPlayPage />} />
              <Route path="/quiz/:sessionId/summary" element={<QuizSummaryPage />} />

              <Route element={<AppShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/quiz/new" element={<QuizConfigPage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/achievements" element={<AchievementsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

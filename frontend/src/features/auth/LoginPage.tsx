import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError, api } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'
import { useEmailCooldown } from './useEmailCooldown'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [unverified, setUnverified] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const cooldown = useEmailCooldown('verify', email)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setUnverified(false)
    setResent(false)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setUnverified(err instanceof ApiError && err.status === 403)
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown.remaining > 0) return
    setResending(true)
    try {
      const data = await api.post<{ retry_after?: number }>('/auth/resend-verification', { email })
      cooldown.start(data.retry_after ?? 60)
      setResent(true)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout title="Bem-vindo de volta">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        {unverified && (
          <div className="space-y-2">
            {resent && (
              <p className="text-sm font-semibold text-leaf-700">
                Se a conta ainda não estiver confirmada, um novo link foi enviado.
              </p>
            )}
            <Button
              type="button"
              full
              disabled={cooldown.remaining > 0}
              loading={resending}
              onClick={() => void handleResend()}
            >
              {cooldown.remaining > 0
                ? `Reenviar em ${cooldown.remaining}s`
                : 'Reenviar e-mail de confirmação'}
            </Button>
          </div>
        )}
        <Button type="submit" full loading={submitting}>
          Entrar
        </Button>
      </form>
      <div className="mt-5 flex flex-col items-center gap-2 text-sm font-bold">
        <Link to="/forgot-password" className="text-leaf-600 hover:underline">
          Esqueci minha senha
        </Link>
        <p className="text-sand-500">
          Ainda não tem conta?{' '}
          <Link to="/register" className="text-leaf-600 hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

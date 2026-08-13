import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError, api } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'
import { useEmailCooldown } from './useEmailCooldown'

export function RegisterPage() {
  const { user, register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const cooldown = useEmailCooldown('verify', pendingEmail || email)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      const { retry_after } = await register(name, email, password)
      cooldown.start(retry_after)
      setPendingEmail(email)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a conta. Tente novamente.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown.remaining > 0) return
    setResending(true)
    setResent(false)
    try {
      const data = await api.post<{ retry_after?: number }>('/auth/resend-verification', {
        email: pendingEmail,
      })
      cooldown.start(data.retry_after ?? 60)
      setResent(true)
    } finally {
      setResending(false)
    }
  }

  if (pendingEmail) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <div className="space-y-4 text-center">
          <span className="text-4xl" aria-hidden>
            📬
          </span>
          <p className="text-sm font-semibold text-sand-600">
            Enviamos um link de confirmação para <strong>{pendingEmail}</strong>. Abra o e-mail e
            clique no link para ativar sua conta.
          </p>
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
            {cooldown.remaining > 0 ? `Reenviar em ${cooldown.remaining}s` : 'Reenviar e-mail'}
          </Button>
          <Link to="/login" className="inline-block text-sm font-bold text-leaf-600 hover:underline">
            Já confirmou? Entrar
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Comece a estudar hoje">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Nome"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo de 8 caracteres"
        />
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" full loading={submitting}>
          Criar conta
        </Button>
      </form>
      <p className="mt-5 text-center text-sm font-bold text-sand-500">
        Já tem conta?{' '}
        <Link to="/login" className="text-leaf-600 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}

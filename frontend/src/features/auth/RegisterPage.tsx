import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError, api } from '@/lib/api'
import { AppIcons, Glyph } from '@/lib/icons'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'
import { useEmailCooldown } from './useEmailCooldown'

function isRegisterReady(name: string, email: string, password: string, acceptedTerms: boolean) {
  return (
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 8 &&
    acceptedTerms
  )
}

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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const cooldown = useEmailCooldown('verify', pendingEmail || email)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!isRegisterReady(name, email, password, acceptedTerms)) {
      setError('Preencha nome, e-mail, senha e o aceite dos termos.')
      return
    }
    setSubmitting(true)
    try {
      const { retry_after } = await register(name, email, password, acceptedTerms)
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
          <span className="mx-auto flex justify-center text-leaf-600">
            <Glyph as={AppIcons.mail} className="h-12 w-12" />
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
          <Link to="/login" className="inline-block py-2 text-sm font-bold text-leaf-600 hover:underline">
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
        <label className="flex items-start gap-3 text-sm font-semibold text-sand-700">
          <input
            type="checkbox"
            required
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-leaf-500"
          />
          <span>
            Li e aceito os{' '}
            <Link to="/termos" target="_blank" rel="noreferrer" className="font-extrabold text-leaf-700 underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link
              to="/privacidade"
              target="_blank"
              rel="noreferrer"
              className="font-extrabold text-leaf-700 underline"
            >
              Política de Privacidade
            </Link>
            . Autorizo o tratamento dos meus dados para criar e operar esta conta.
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <Button
          type="submit"
          full
          loading={submitting}
          disabled={!isRegisterReady(name, email, password, acceptedTerms)}
        >
          Criar conta
        </Button>
      </form>
      <p className="mt-5 text-center text-sm font-bold text-sand-500">
        Já tem conta?{' '}
        <Link to="/login" className="py-2 text-leaf-600 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}

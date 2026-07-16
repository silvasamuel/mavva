import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiError } from '@/lib/api'

export function AdminLogin({
  onLogin,
  forbidden,
  onLogout,
}: {
  onLogin: (email: string, password: string) => Promise<void>
  forbidden: boolean
  onLogout: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink px-4">
      <div className="flex items-center gap-2 text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-leaf-500 text-xl">
          🔒
        </span>
        <span className="text-2xl font-extrabold tracking-tight">mavva · admin</span>
      </div>

      {forbidden ? (
        <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-8 text-center shadow-card">
          <span className="text-4xl" aria-hidden>
            🚫
          </span>
          <p className="font-extrabold text-ink">Acesso restrito</p>
          <p className="text-sm font-semibold text-sand-500">
            Esta conta não tem permissão de administrador.
          </p>
          <Button variant="secondary" full onClick={onLogout}>
            Entrar com outra conta
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-8 shadow-card"
          noValidate
        >
          <h1 className="text-center text-lg font-extrabold">Painel administrativo</h1>
          <Input
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" full loading={submitting}>
            Entrar
          </Button>
        </form>
      )}
    </div>
  )
}

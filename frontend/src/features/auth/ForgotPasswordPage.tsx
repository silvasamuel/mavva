import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/api'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { email })
    } finally {
      // Always show success — the API never reveals whether the e-mail exists.
      setSent(true)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Recuperar senha">
      {sent ? (
        <div className="space-y-4 text-center">
          <span className="text-4xl" aria-hidden>
            📬
          </span>
          <p className="text-sm font-semibold text-sand-600">
            Se existir uma conta com <strong>{email}</strong>, você receberá um link para criar uma
            nova senha. O link vale por 30 minutos.
          </p>
          <Link to="/login" className="inline-block text-sm font-bold text-leaf-600 hover:underline">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="text-sm font-semibold text-sand-600">
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </p>
          <Input
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
          />
          <Button type="submit" full loading={submitting}>
            Enviar link
          </Button>
          <p className="text-center">
            <Link to="/login" className="text-sm font-bold text-leaf-600 hover:underline">
              Voltar para o login
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

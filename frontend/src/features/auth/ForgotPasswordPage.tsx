import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { useEmailCooldown } from './useEmailCooldown'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const cooldown = useEmailCooldown('reset', email)

  async function sendLink() {
    if (cooldown.remaining > 0) return
    setSubmitting(true)
    try {
      const data = await api.post<{ retry_after?: number }>('/auth/forgot-password', { email })
      cooldown.start(data.retry_after ?? 60)
      setSent(true)
    } finally {
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
          <Button
            type="button"
            full
            disabled={cooldown.remaining > 0}
            loading={submitting}
            onClick={() => void sendLink()}
          >
            {cooldown.remaining > 0 ? `Reenviar em ${cooldown.remaining}s` : 'Enviar de novo'}
          </Button>
          <Link to="/login" className="inline-block text-sm font-bold text-leaf-600 hover:underline">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void sendLink()
          }}
          className="space-y-4"
          noValidate
        >
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
          <Button type="submit" full disabled={cooldown.remaining > 0} loading={submitting}>
            {cooldown.remaining > 0 ? `Reenviar em ${cooldown.remaining}s` : 'Enviar link'}
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

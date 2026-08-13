import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import type { TokenResponse } from '@/types/api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'

export function VerifyEmailPage() {
  const { user, applySession } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    void (async () => {
      try {
        const data = await api.post<TokenResponse>('/auth/verify-email', { token })
        applySession(data)
        navigate('/', { replace: true })
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível confirmar o e-mail. Tente novamente.'
        )
      }
    })()
  }, [token, applySession, navigate])

  if (user) return <Navigate to="/" replace />

  if (!token) {
    return (
      <AuthLayout title="Link inválido">
        <p className="text-center text-sm font-semibold text-sand-600">
          Este link de confirmação é inválido ou está incompleto.{' '}
          <Link to="/register" className="font-bold text-leaf-600 hover:underline">
            Criar conta
          </Link>
          .
        </p>
      </AuthLayout>
    )
  }

  if (error) {
    return (
      <AuthLayout title="Não foi possível confirmar">
        <p className="text-center text-sm font-semibold text-sand-600">
          {error}{' '}
          <Link to="/login" className="font-bold text-leaf-600 hover:underline">
            Ir para o login
          </Link>{' '}
          para reenviar o e-mail.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Confirmando e-mail">
      <p className="text-center text-sm font-semibold text-sand-600">Aguarde um instante…</p>
    </AuthLayout>
  )
}

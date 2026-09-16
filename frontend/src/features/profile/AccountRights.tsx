import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/features/auth/AuthContext'
import { LEGAL_CONTACT_EMAIL } from '@/features/legal/legal'

export function AccountRights() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function downloadExport() {
    setExporting(true)
    setError('')
    setMessage('')
    try {
      const data = await api.get<Record<string, unknown>>('/users/me/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'mavva-dados.json'
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Cópia dos seus dados baixada.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível baixar seus dados.')
    } finally {
      setExporting(false)
    }
  }

  async function confirmDelete() {
    if (!password) {
      setError('Digite sua senha para apagar a conta.')
      return
    }
    setDeleting(true)
    setError('')
    try {
      await api.delete('/users/me', { password })
      await logout()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível apagar a conta.')
      setDeleting(false)
    }
  }

  return (
    <Card className="space-y-4">
      <CardTitle>Seus direitos</CardTitle>
      <p className="text-sm font-semibold text-sand-600">
        Baixe uma cópia do que o Mavva guarda sobre você ou apague a conta. A exclusão remove
        quizzes, duelos, amigos e o cadastro, e não dá para desfazer.
      </p>
      {message && <p className="text-sm font-bold text-leaf-700">{message}</p>}
      {error && (
        <p role="alert" className="text-sm font-bold text-red-600">
          {error}
        </p>
      )}
      <Button variant="secondary" full loading={exporting} onClick={() => void downloadExport()}>
        Baixar meus dados
      </Button>
      <Button variant="danger" full onClick={() => setConfirmOpen(true)}>
        Apagar conta
      </Button>
      <p className="text-center text-xs font-semibold text-sand-500">
        Dúvidas para{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-extrabold text-leaf-700 underline">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>

      <Modal open={confirmOpen} onClose={() => !deleting && setConfirmOpen(false)} label="Apagar conta">
        <h2 className="text-lg font-extrabold">Apagar a conta de vez?</h2>
        <p className="text-sm font-semibold text-sand-600">
          Isso remove seus dados pessoais do Mavva. Confirme com a senha.
        </p>
        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="flex flex-col gap-2">
          <Button variant="danger" full loading={deleting} onClick={() => void confirmDelete()}>
            Apagar definitivamente
          </Button>
          <Button variant="ghost" full disabled={deleting} onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

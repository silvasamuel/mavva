import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/features/auth/AuthContext'
import { LEGAL_CONTACT_EMAIL } from '@/features/legal/legal'

// Typed word required alongside the password before the delete button
// unlocks — a second, deliberate barrier against an accidental click.
const CONFIRM_WORD = 'APAGAR'

export function AccountRights() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_WORD && password.length > 0

  function closeModal() {
    if (deleting) return
    setConfirmOpen(false)
    setPassword('')
    setConfirmText('')
    setError('')
  }

  async function confirmDelete() {
    if (!canDelete) return
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
      <CardTitle>Sua conta</CardTitle>
      <p className="text-sm font-semibold text-sand-600">
        Apagar a conta remove quizzes, duelos, amigos e o cadastro, e não dá para desfazer. Para
        pedir uma cópia dos seus dados, escreva para o encarregado.
      </p>
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

      <Modal open={confirmOpen} onClose={closeModal} label="Apagar conta">
        <h2 className="text-lg font-extrabold">Apagar a conta de vez?</h2>
        <p className="text-sm font-semibold text-sand-600">
          Isso remove seus dados pessoais do Mavva e não pode ser desfeito. Digite{' '}
          <strong className="font-extrabold text-ink">{CONFIRM_WORD}</strong> e confirme com a
          senha.
        </p>
        <Input
          label={`Digite ${CONFIRM_WORD} para confirmar`}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          autoComplete="off"
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm font-bold text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            full
            disabled={!canDelete}
            loading={deleting}
            onClick={() => void confirmDelete()}
          >
            Apagar definitivamente
          </Button>
          <Button variant="ghost" full disabled={deleting} onClick={closeModal}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

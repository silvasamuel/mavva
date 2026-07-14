import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { User } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthContext'

const GOAL_OPTIONS = [
  { value: 20, label: '20 XP — Casual' },
  { value: 50, label: '50 XP — Constante' },
  { value: 100, label: '100 XP — Dedicado' },
  { value: 150, label: '150 XP — Intenso' },
]

export function ProfilePage() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.name ?? '')
  const [dailyGoal, setDailyGoal] = useState(user?.daily_goal_xp ?? 50)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => api.patch<User>('/users/me', { name, daily_goal_xp: dailyGoal }),
    onSuccess: (updated) => {
      updateUser(updated)
      setMessage('Alterações salvas!')
      setError('')
    },
    onError: (err) => {
      setMessage('')
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    },
  })

  return (
    <div className="animate-float-up mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Perfil</h1>
        <p className="text-sm font-semibold text-sand-500">{user?.email}</p>
      </header>

      <Card className="space-y-4">
        <CardTitle>Seus dados</CardTitle>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="space-y-1.5">
          <p className="text-sm font-bold text-sand-700">Meta diária</p>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={dailyGoal === option.value}
                onClick={() => setDailyGoal(option.value)}
                className={`rounded-2xl px-3 py-2.5 text-sm font-extrabold transition-colors ${
                  dailyGoal === option.value
                    ? 'bg-leaf-500 text-white'
                    : 'bg-sand-50 text-sand-600 hover:bg-sand-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {message && <p className="text-sm font-bold text-leaf-700">{message}</p>}
        {error && (
          <p role="alert" className="text-sm font-bold text-red-600">
            {error}
          </p>
        )}

        <Button full loading={save.isPending} onClick={() => save.mutate()}>
          Salvar
        </Button>
      </Card>

      <Card>
        <Button
          variant="danger"
          full
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          Sair da conta
        </Button>
      </Card>
    </div>
  )
}

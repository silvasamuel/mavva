import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatPercent } from '@/lib/format'
import type { AdminUserList } from './types'

const PAGE = 25

export function UsersPanel() {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search, offset],
    queryFn: () =>
      api.get<AdminUserList>(
        `/admin/users?limit=${PAGE}&offset=${offset}` +
          (search ? `&search=${encodeURIComponent(search)}` : '')
      ),
  })

  return (
    <div className="space-y-4">
      <Input
        label="Buscar por nome ou e-mail"
        placeholder="ex: samuel@…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setOffset(0)
        }}
      />

      {isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-leaf-500" />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-sand-100 text-xs font-extrabold uppercase tracking-wide text-sand-500">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Nível / XP</th>
                <th className="px-4 py-3">Streak</th>
                <th className="px-4 py-3">Respondidas</th>
                <th className="px-4 py-3">Precisão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-50">
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-sand-25">
                  <td className="px-4 py-3">
                    <p className="font-bold text-ink">{u.name}</p>
                    <p className="text-xs text-sand-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                        u.role === 'admin'
                          ? 'bg-leaf-100 text-leaf-700'
                          : 'bg-sand-100 text-sand-600'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    Nível {u.level} · {u.total_xp} XP
                  </td>
                  <td className="px-4 py-3 font-semibold">🔥 {u.current_streak}</td>
                  <td className="px-4 py-3 font-semibold">{u.questions_answered}</td>
                  <td className="px-4 py-3 font-semibold">{formatPercent(u.accuracy)}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sand-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.total > PAGE && (
        <Pagination offset={offset} total={data.total} onChange={setOffset} />
      )}
    </div>
  )
}

export function Pagination({
  offset,
  total,
  onChange,
}: {
  offset: number
  total: number
  onChange: (offset: number) => void
}) {
  const from = offset + 1
  const to = Math.min(offset + PAGE, total)
  return (
    <div className="flex items-center justify-between text-sm font-bold text-sand-600">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex gap-2">
        <button
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - PAGE))}
          className="rounded-xl bg-white px-3 py-1.5 shadow-card disabled:opacity-40"
        >
          ← Anterior
        </button>
        <button
          disabled={to >= total}
          onClick={() => onChange(offset + PAGE)}
          className="rounded-xl bg-white px-3 py-1.5 shadow-card disabled:opacity-40"
        >
          Próxima →
        </button>
      </div>
    </div>
  )
}

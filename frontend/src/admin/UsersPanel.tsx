import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatPercent } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import type { AdminUserList } from './types'
import { UserDetail } from './UserDetail'

const PAGE = 25

export function UsersPanel({ adminId }: { adminId: string }) {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The input updates on every keystroke; the request only fires once typing pauses.
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, offset],
    queryFn: () =>
      api.get<AdminUserList>(
        `/admin/users?limit=${PAGE}&offset=${offset}` +
          (debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '')
      ),
    placeholderData: keepPreviousData,
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
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-sand-100 text-xs font-extrabold uppercase tracking-wide text-sand-500">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Nível / XP</th>
                <th className="px-4 py-3">Streak</th>
                <th className="px-4 py-3">Respondidas</th>
                <th className="px-4 py-3">Precisão</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-50">
              {data.items.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer hover:bg-sand-25"
                  onClick={() => setSelectedId(u.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-ink">{u.name}</p>
                    <p className="text-xs font-semibold text-sand-500">@{u.username}</p>
                    <p className="text-xs text-sand-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      ok={Boolean(u.email_verified_at)}
                      okLabel="Confirmado"
                      badLabel="Não confirmou"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge ok={u.is_active} okLabel="Ativo" badLabel="Inativo" />
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedId(u.id)
                      }}
                      className="rounded-xl bg-leaf-500 px-3 py-1.5 text-xs font-extrabold uppercase text-white hover:bg-leaf-600"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sand-500">
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

      {selectedId && (
        <UserDetail
          userId={selectedId}
          adminId={adminId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function Badge({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean
  okLabel: string
  badLabel: string
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-extrabold ${
        ok ? 'bg-leaf-100 text-leaf-700' : 'bg-red-50 text-red-700'
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
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

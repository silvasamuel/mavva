import { useState } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatPercent } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import type { AdminUserList } from './types'
import { UserDetail } from './UserDetail'
import { AppIcons, Glyph } from '@/lib/icons'

const PAGE = 25

// Maps each clickable header to the backend's sort field. The trailing
// action column has no entry — it isn't sortable.
const SORT_FIELDS = {
  user: 'name',
  emailStatus: 'email_verified',
  status: 'is_active',
  role: 'role',
  xp: 'xp',
  streak: 'streak',
  answered: 'answered',
  accuracy: 'accuracy',
} as const

type SortKey = (typeof SORT_FIELDS)[keyof typeof SORT_FIELDS]

export function UsersPanel({ adminId }: { adminId: string }) {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // "" = default (newest first); otherwise a SORT_FIELDS value, "-" prefixed for descending.
  const [sort, setSort] = useState('')
  // The input updates on every keystroke; the request only fires once typing pauses.
  const debouncedSearch = useDebouncedValue(search)

  function toggleSort(field: SortKey) {
    setSort((current) => (current === field ? `-${field}` : field))
    setOffset(0)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, sort, offset],
    queryFn: () =>
      api.get<AdminUserList>(
        `/admin/users?limit=${PAGE}&offset=${offset}` +
          (debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '') +
          (sort ? `&sort=${sort}` : '')
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
                <SortHeader label="Usuário" field={SORT_FIELDS.user} sort={sort} onSort={toggleSort} />
                <SortHeader
                  label="E-mail"
                  field={SORT_FIELDS.emailStatus}
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortHeader label="Status" field={SORT_FIELDS.status} sort={sort} onSort={toggleSort} />
                <SortHeader label="Papel" field={SORT_FIELDS.role} sort={sort} onSort={toggleSort} />
                <SortHeader label="Nível / XP" field={SORT_FIELDS.xp} sort={sort} onSort={toggleSort} />
                <SortHeader label="Streak" field={SORT_FIELDS.streak} sort={sort} onSort={toggleSort} />
                <SortHeader
                  label="Respondidas"
                  field={SORT_FIELDS.answered}
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Precisão"
                  field={SORT_FIELDS.accuracy}
                  sort={sort}
                  onSort={toggleSort}
                />
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
                  <td className="px-4 py-3 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      {u.current_streak > 0 && (
                        <Glyph as={AppIcons.streak} className="h-4 w-4 text-grain-600" />
                      )}
                      {u.current_streak}
                    </span>
                  </td>
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

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string
  field: SortKey
  sort: string
  onSort: (field: SortKey) => void
}) {
  const active = sort === field || sort === `-${field}`
  const descending = sort === `-${field}`
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        {active &&
          (descending ? (
            <CaretDown weight="bold" className="h-3 w-3" aria-hidden />
          ) : (
            <CaretUp weight="bold" className="h-3 w-3" aria-hidden />
          ))}
      </button>
    </th>
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

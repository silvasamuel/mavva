import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { DIFFICULTY_LABELS } from '@/lib/format'
import type { AdminCategory, AdminQuestionList } from './types'
import { Pagination } from './UsersPanel'
import { QuestionEditor } from './QuestionEditor'

const PAGE = 25

export function QuestionsPanel() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [difficulty, setDifficulty] = useState('')
  const [offset, setOffset] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get<AdminCategory[]>('/admin/categories'),
  })

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
  if (search) params.set('search', search)
  if (categoryId !== '') params.set('category_id', String(categoryId))
  if (difficulty) params.set('difficulty', difficulty)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'questions', params.toString()],
    queryFn: () => api.get<AdminQuestionList>(`/admin/questions?${params.toString()}`),
  })

  function resetPaging() {
    setOffset(0)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Input
          label="Buscar (texto ou id)"
          placeholder="ex: quem construiu a arca"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            resetPaging()
          }}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-sand-700">Categoria</label>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value === '' ? '' : Number(e.target.value))
              resetPaging()
            }}
            className="w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500"
          >
            <option value="">Todas</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-sand-700">Dificuldade</label>
          <select
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value)
              resetPaging()
            }}
            className="w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500"
          >
            <option value="">Todas</option>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-leaf-500" />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-sand-100 text-xs font-extrabold uppercase tracking-wide text-sand-500">
              <tr>
                <th className="px-4 py-3">Pergunta</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Nível</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-50">
              {data.items.map((q) => (
                <tr key={q.id} className="hover:bg-sand-25">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{q.text}</p>
                    <p className="text-xs text-sand-400">
                      {q.external_id}
                      {!q.is_active && ' · inativa'}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{q.category_name}</td>
                  <td className="px-4 py-3 text-xs font-bold text-sand-500">
                    {q.type === 'multiple_choice' ? 'Múltipla' : 'Aberta'}
                  </td>
                  <td className="px-4 py-3 font-semibold">{DIFFICULTY_LABELS[q.difficulty]}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditingId(q.id)}
                      className="rounded-xl bg-leaf-500 px-3 py-1.5 text-xs font-extrabold uppercase text-white hover:bg-leaf-600"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sand-500">
                    Nenhuma pergunta encontrada.
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

      {editingId && (
        <QuestionEditor
          questionId={editingId}
          categories={categories ?? []}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

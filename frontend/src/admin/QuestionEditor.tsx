import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { DIFFICULTY_LABELS } from '@/lib/format'
import type { AdminCategory, AdminQuestionDetail, AdminQuestionUpdate } from './types'

const FIELD =
  'w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500 focus-visible:ring-0'

export function QuestionEditor({
  questionId,
  categories,
  onClose,
}: {
  questionId: string
  categories: AdminCategory[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'question', questionId],
    queryFn: () => api.get<AdminQuestionDetail>(`/admin/questions/${questionId}`),
  })

  const [form, setForm] = useState<AdminQuestionDetail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (data) setForm(structuredClone(data))
  }, [data])

  const save = useMutation({
    mutationFn: (payload: AdminQuestionUpdate) =>
      api.patch<AdminQuestionDetail>(`/admin/questions/${questionId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question', questionId] })
      onClose()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.'),
  })

  function handleSave() {
    if (!form) return
    setError('')
    const payload: AdminQuestionUpdate = {
      text: form.text,
      explanation: form.explanation,
      divergence_note: form.divergence_note?.trim() ? form.divergence_note : null,
      book: form.book,
      chapter: form.chapter,
      verse_start: form.verse_start,
      verse_end: form.verse_end,
      theme: form.theme,
      difficulty: form.difficulty,
      category_id: form.category_id,
      subcategory: form.subcategory?.trim() ? form.subcategory : null,
      tags: form.tags,
      is_active: form.is_active,
    }
    if (form.type === 'multiple_choice') payload.options = form.options
    else payload.accepted_answers = form.accepted_answers
    save.mutate(payload)
  }

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-label="Editar pergunta"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-sand-50 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Editar pergunta</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-2xl text-sand-400 hover:text-sand-600"
          >
            ✕
          </button>
        </div>

        {isLoading || !form ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7 text-leaf-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs font-bold text-sand-400">
              {form.external_id} · {form.type === 'multiple_choice' ? 'Múltipla escolha' : 'Resposta aberta'}
            </p>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-sand-700">Enunciado</label>
              <textarea
                value={form.text}
                rows={3}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                className={FIELD}
              />
            </div>

            {form.type === 'multiple_choice' ? (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-sand-700">
                  Alternativas (marque a correta)
                </label>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={opt.is_correct}
                      aria-label={`Alternativa ${i + 1} correta`}
                      onChange={() =>
                        setForm({
                          ...form,
                          options: form.options.map((o, j) => ({ ...o, is_correct: j === i })),
                        })
                      }
                      className="h-5 w-5 accent-leaf-500"
                    />
                    <input
                      value={opt.text}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          options: form.options.map((o, j) =>
                            j === i ? { ...o, text: e.target.value } : o
                          ),
                        })
                      }
                      className={`${FIELD} ${opt.is_correct ? 'border-leaf-400 bg-leaf-50' : ''}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-sand-700">
                  Respostas aceitas (a primeira é a canônica)
                </label>
                {form.accepted_answers.map((ans, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={ans.text}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          accepted_answers: form.accepted_answers.map((a, j) =>
                            j === i ? { text: e.target.value } : a
                          ),
                        })
                      }
                      className={FIELD}
                    />
                    <button
                      aria-label="Remover resposta"
                      onClick={() =>
                        setForm({
                          ...form,
                          accepted_answers: form.accepted_answers.filter((_, j) => j !== i),
                        })
                      }
                      className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setForm({ ...form, accepted_answers: [...form.accepted_answers, { text: '' }] })
                  }
                  className="text-sm font-bold text-leaf-600 hover:underline"
                >
                  + Adicionar resposta
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-sand-700">Explicação</label>
              <textarea
                value={form.explanation}
                rows={4}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className={FIELD}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-sand-700">
                Nota de divergência (opcional)
              </label>
              <textarea
                value={form.divergence_note ?? ''}
                rows={2}
                onChange={(e) => setForm({ ...form, divergence_note: e.target.value })}
                className={FIELD}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Livro (slug)"
                value={form.book}
                onChange={(e) => setForm({ ...form, book: e.target.value.trim() })}
              />
              <Input
                label="Capítulo"
                type="number"
                value={form.chapter}
                onChange={(e) => setForm({ ...form, chapter: Number(e.target.value) })}
              />
              <Input
                label="Versículo"
                type="number"
                value={form.verse_start}
                onChange={(e) => setForm({ ...form, verse_start: Number(e.target.value) })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-sand-700">Categoria</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}
                  className={FIELD}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-sand-700">Dificuldade</label>
                <select
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm({ ...form, difficulty: e.target.value as AdminQuestionDetail['difficulty'] })
                  }
                  className={FIELD}
                >
                  {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Input
              label="Tema"
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value })}
            />

            <label className="flex items-center gap-2 text-sm font-bold text-sand-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-5 w-5 accent-leaf-500"
              />
              Pergunta ativa (aparece nos quizzes)
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" full onClick={onClose}>
                Cancelar
              </Button>
              <Button full loading={save.isPending} onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

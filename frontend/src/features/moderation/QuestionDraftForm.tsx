import type { BibleBook, Category, Difficulty, QuestionDraft, QuestionType } from '@/types/api'
import { Input } from '@/components/ui/Input'
import { DIFFICULTY_LABELS } from '@/lib/format'
import { EMPTY_OPTIONS } from './questionDraft'

const FIELD =
  'w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500 focus-visible:ring-0'

export function QuestionDraftForm({
  draft,
  onChange,
  categories,
  books,
}: {
  draft: QuestionDraft
  onChange: (draft: QuestionDraft) => void
  categories: Pick<Category, 'id' | 'name' | 'icon'>[]
  books: BibleBook[]
}) {
  function setType(type: QuestionType) {
    if (type === 'multiple_choice') {
      onChange({
        ...draft,
        type,
        options: EMPTY_OPTIONS.map((option) => ({ ...option })),
        accepted_answers: null,
      })
      return
    }
    onChange({ ...draft, type, options: null, accepted_answers: [''] })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-sand-700">Categoria</label>
          <select
            value={draft.category_id}
            onChange={(event) => onChange({ ...draft, category_id: Number(event.target.value) })}
            className={FIELD}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-sand-700">Tipo</label>
          <select
            value={draft.type}
            onChange={(event) => setType(event.target.value as QuestionType)}
            className={FIELD}
          >
            <option value="multiple_choice">Múltipla escolha</option>
            <option value="open_answer">Resposta aberta</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-sand-700">Enunciado</label>
        <textarea
          value={draft.text}
          rows={3}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
          className={FIELD}
        />
      </div>

      {draft.type === 'multiple_choice' ? (
        <div className="space-y-2">
          <label className="block text-sm font-bold text-sand-700">
            Alternativas (marque a correta)
          </label>
          {(draft.options ?? EMPTY_OPTIONS).map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={option.correct}
                aria-label={`Alternativa ${index + 1} correta`}
                onChange={() =>
                  onChange({
                    ...draft,
                    options: (draft.options ?? []).map((item, itemIndex) => ({
                      ...item,
                      correct: itemIndex === index,
                    })),
                  })
                }
                className="h-5 w-5 accent-leaf-500"
              />
              <input
                value={option.text}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    options: (draft.options ?? []).map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    ),
                  })
                }
                className={`${FIELD} ${option.correct ? 'border-leaf-400 bg-leaf-50' : ''}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-bold text-sand-700">
            Respostas aceitas (a primeira é a canônica)
          </label>
          {(draft.accepted_answers ?? ['']).map((answer, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={answer}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    accepted_answers: (draft.accepted_answers ?? []).map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item
                    ),
                  })
                }
                className={FIELD}
              />
              <button
                type="button"
                aria-label="Remover resposta"
                onClick={() =>
                  onChange({
                    ...draft,
                    accepted_answers: (draft.accepted_answers ?? []).filter(
                      (_, itemIndex) => itemIndex !== index
                    ),
                  })
                }
                className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                accepted_answers: [...(draft.accepted_answers ?? []), ''],
              })
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
          value={draft.explanation}
          rows={4}
          onChange={(event) => onChange({ ...draft, explanation: event.target.value })}
          className={FIELD}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-sand-700">Nota de divergência (opcional)</label>
        <textarea
          value={draft.divergence_note ?? ''}
          rows={2}
          onChange={(event) => onChange({ ...draft, divergence_note: event.target.value })}
          className={FIELD}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 space-y-1.5">
          <label className="block text-sm font-bold text-sand-700">Livro</label>
          <select
            value={draft.book}
            onChange={(event) => onChange({ ...draft, book: event.target.value })}
            className={FIELD}
          >
            {books.map((book) => (
              <option key={book.slug} value={book.slug}>
                {book.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Capítulo"
          type="number"
          min={1}
          value={draft.chapter}
          onChange={(event) => onChange({ ...draft, chapter: Number(event.target.value) })}
        />
        <Input
          label="Versículo"
          type="number"
          min={1}
          value={draft.verse_start}
          onChange={(event) => onChange({ ...draft, verse_start: Number(event.target.value) })}
        />
      </div>

      <Input
        label="Até o versículo (opcional)"
        type="number"
        min={1}
        value={draft.verse_end ?? ''}
        onChange={(event) =>
          onChange({
            ...draft,
            verse_end: event.target.value === '' ? null : Number(event.target.value),
          })
        }
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-sand-700">Dificuldade</label>
        <select
          value={draft.difficulty}
          onChange={(event) =>
            onChange({ ...draft, difficulty: event.target.value as Difficulty })
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
  )
}

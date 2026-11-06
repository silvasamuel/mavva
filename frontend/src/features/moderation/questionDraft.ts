import type { QuestionDraft } from '@/types/api'

export const EMPTY_OPTIONS = [
  { text: '', correct: true },
  { text: '', correct: false },
  { text: '', correct: false },
  { text: '', correct: false },
]

export function emptyDraft(categoryId: number, book: string): QuestionDraft {
  return {
    category_id: categoryId,
    text: '',
    options: EMPTY_OPTIONS.map((option) => ({ ...option })),
    explanation: '',
    divergence_note: null,
    book,
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    difficulty: 'easy',
  }
}

export function draftFromPayload(payload: QuestionDraft, fallback: QuestionDraft): QuestionDraft {
  return {
    ...fallback,
    ...payload,
    options:
      payload.options?.length === 4
        ? payload.options.map((option) => ({ text: option.text, correct: Boolean(option.correct) }))
        : EMPTY_OPTIONS.map((option) => ({ ...option })),
    divergence_note: payload.divergence_note ?? null,
    verse_end: payload.verse_end ?? null,
  }
}

export function validateDraft(draft: QuestionDraft): string | null {
  if (draft.text.trim().length < 10) return 'O enunciado precisa ter pelo menos 10 caracteres.'
  if (draft.explanation.trim().length < 10) {
    return 'A explicação precisa ter pelo menos 10 caracteres.'
  }
  if (!draft.book) return 'Escolha o livro.'
  if (!draft.category_id) return 'Escolha a categoria.'
  if (draft.chapter < 1 || draft.verse_start < 1) {
    return 'Capítulo e versículo precisam ser maiores que zero.'
  }
  if (draft.verse_end != null && draft.verse_end < draft.verse_start) {
    return 'O versículo final não pode ser menor que o inicial.'
  }
  if (draft.options.length !== 4 || draft.options.some((option) => !option.text.trim())) {
    return 'Preencha as 4 alternativas.'
  }
  if (draft.options.filter((option) => option.correct).length !== 1) {
    return 'Marque exatamente 1 alternativa correta.'
  }
  return null
}

export function toApiDraft(draft: QuestionDraft): QuestionDraft {
  return {
    ...draft,
    text: draft.text.trim(),
    explanation: draft.explanation.trim(),
    divergence_note: draft.divergence_note?.trim() || null,
    verse_end: draft.verse_end || null,
    options: draft.options.map((option) => ({ ...option, text: option.text.trim() })),
  }
}

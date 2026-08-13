import type { QuestionDraft, QuestionType } from '@/types/api'

export const EMPTY_OPTIONS = [
  { text: '', correct: true },
  { text: '', correct: false },
  { text: '', correct: false },
  { text: '', correct: false },
]

export function emptyDraft(categoryId: number, book: string): QuestionDraft {
  return {
    category_id: categoryId,
    type: 'multiple_choice',
    text: '',
    options: EMPTY_OPTIONS.map((option) => ({ ...option })),
    accepted_answers: null,
    explanation: '',
    divergence_note: null,
    book,
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    theme: '',
    difficulty: 'easy',
    subcategory: null,
    tags: [],
  }
}

export function draftFromPayload(payload: QuestionDraft, fallback: QuestionDraft): QuestionDraft {
  const type: QuestionType = payload.type === 'open_answer' ? 'open_answer' : 'multiple_choice'
  return {
    ...fallback,
    ...payload,
    type,
    options:
      type === 'multiple_choice'
        ? payload.options?.length === 4
          ? payload.options.map((option) => ({ text: option.text, correct: Boolean(option.correct) }))
          : EMPTY_OPTIONS.map((option) => ({ ...option }))
        : null,
    accepted_answers: type === 'open_answer' ? payload.accepted_answers ?? [''] : null,
    divergence_note: payload.divergence_note ?? null,
    verse_end: payload.verse_end ?? null,
    subcategory: payload.subcategory ?? null,
    tags: payload.tags ?? [],
  }
}

export function validateDraft(draft: QuestionDraft): string | null {
  if (draft.text.trim().length < 10) return 'O enunciado precisa ter pelo menos 10 caracteres.'
  if (draft.explanation.trim().length < 10) {
    return 'A explicação precisa ter pelo menos 10 caracteres.'
  }
  if (draft.theme.trim().length < 2) return 'Informe um tema.'
  if (!draft.book) return 'Escolha o livro.'
  if (!draft.category_id) return 'Escolha a categoria.'
  if (draft.chapter < 1 || draft.verse_start < 1) {
    return 'Capítulo e versículo precisam ser maiores que zero.'
  }
  if (draft.verse_end != null && draft.verse_end < draft.verse_start) {
    return 'O versículo final não pode ser menor que o inicial.'
  }
  if (draft.type === 'multiple_choice') {
    const options = draft.options ?? []
    if (options.length !== 4 || options.some((option) => !option.text.trim())) {
      return 'Preencha as 4 alternativas.'
    }
    if (options.filter((option) => option.correct).length !== 1) {
      return 'Marque exatamente 1 alternativa correta.'
    }
  } else if (!(draft.accepted_answers ?? []).map((answer) => answer.trim()).filter(Boolean).length) {
    return 'Informe pelo menos uma resposta aceita.'
  }
  return null
}

export function toApiDraft(draft: QuestionDraft): QuestionDraft {
  return {
    ...draft,
    text: draft.text.trim(),
    explanation: draft.explanation.trim(),
    theme: draft.theme.trim(),
    divergence_note: draft.divergence_note?.trim() || null,
    subcategory: draft.subcategory?.trim() || null,
    verse_end: draft.verse_end || null,
    options: draft.type === 'multiple_choice' ? draft.options : null,
    accepted_answers:
      draft.type === 'open_answer'
        ? (draft.accepted_answers ?? []).map((answer) => answer.trim()).filter(Boolean)
        : null,
    tags: draft.tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6),
  }
}

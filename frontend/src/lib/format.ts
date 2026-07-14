export function formatStudyTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.round((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  return `${hours}h ${minutes.toString().padStart(2, '0')}min`
}

export function formatPercent(ratio: number | null): string {
  if (ratio == null) return '—'
  return `${Math.round(ratio * 100)}%`
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const diffDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `${diffDays} dias atrás`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  expert: 'Especialista',
}

export const TESTAMENT_LABELS: Record<string, string> = {
  old: 'Antigo Testamento',
  new: 'Novo Testamento',
}

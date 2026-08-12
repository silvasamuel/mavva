export type RankCode =
  | 'semente'
  | 'broto'
  | 'espiga'
  | 'videira'
  | 'oliveira'
  | 'cedro'
  | 'celeiro'

export interface Rank {
  code: RankCode
  name: string
  minLevel: number
  maxLevel: number | null
}

const CODES: RankCode[] = [
  'semente',
  'broto',
  'espiga',
  'videira',
  'oliveira',
  'cedro',
  'celeiro',
]

const NAMES: Record<RankCode, string> = {
  semente: 'Semente',
  broto: 'Broto',
  espiga: 'Espiga',
  videira: 'Videira',
  oliveira: 'Oliveira',
  cedro: 'Cedro',
  celeiro: 'Celeiro',
}

export const RANK_FLAVOR: Record<RankCode, string> = {
  semente: 'Tudo começa no chão.',
  broto: 'O hábito pegou.',
  espiga: 'A espiga amadureceu.',
  videira: 'Já dá fruto.',
  oliveira: 'Raiz profunda.',
  cedro: 'Presença rara.',
  celeiro: 'O celeiro encheu.',
}

const LEVELS_PER_RANK = 5

export function rankFromLevel(level: number): Rank {
  const safe = Math.max(1, level)
  const index = Math.min(Math.floor((safe - 1) / LEVELS_PER_RANK), CODES.length - 1)
  const code = CODES[index]
  const minLevel = index * LEVELS_PER_RANK + 1
  const maxLevel = index === CODES.length - 1 ? null : minLevel + LEVELS_PER_RANK - 1
  return { code, name: NAMES[code], minLevel, maxLevel }
}

export function isRankCode(value: string): value is RankCode {
  return CODES.includes(value as RankCode)
}

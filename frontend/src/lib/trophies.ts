/**
 * One trophy per month of the year, each named for one of the twelve tribes of
 * Israel in the order of Jacob's sons' birth: January is Rúben, December is
 * Benjamim. The gem is that tribe's stone on the high priest's breastplate,
 * which carried their names "according to their birth" (Êxodo 28:10, 17-21).
 */
export interface MonthTrophyStyle {
  /** "setembro" */
  month: string
  /** "SET" — engraved on the base */
  short: string
  /** "Issacar" */
  tribe: string
  /** A short Bible fact about the tribe, with its reference. */
  fact: string
  /** the tribe's breastplate stone, as a gradient: light facet, deep facet */
  gem: [string, string]
}

export const MONTH_TROPHIES: MonthTrophyStyle[] = [
  {
    month: 'janeiro',
    short: 'JAN',
    tribe: 'Rúben',
    fact: 'Primogênito de Jacó, foi ele quem convenceu os irmãos a não matar José (Gênesis 37:21-22).',
    gem: ['#FF9A5C', '#C2410C'],
  },
  {
    month: 'fevereiro',
    short: 'FEV',
    tribe: 'Simeão',
    fact: 'Ficou preso no Egito como garantia até os irmãos voltarem com Benjamim (Gênesis 42:24).',
    gem: ['#FFE27A', '#D99A06'],
  },
  {
    month: 'março',
    short: 'MAR',
    tribe: 'Levi',
    fact: 'A tribo dos sacerdotes não recebeu território: ganhou 48 cidades espalhadas por Israel (Josué 21:41).',
    gem: ['#FF6B7A', '#A3122A'],
  },
  {
    month: 'abril',
    short: 'ABR',
    tribe: 'Judá',
    fact: 'Dela vieram o rei Davi e Jesus, chamado "o Leão da tribo de Judá" (Apocalipse 5:5).',
    gem: ['#6EE7A0', '#0B8A4A'],
  },
  {
    month: 'maio',
    short: 'MAI',
    tribe: 'Dã',
    fact: 'Sansão, o juiz de força extraordinária, era da tribo de Dã (Juízes 13:2, 24).',
    gem: ['#7DB8FF', '#1D3FA8'],
  },
  {
    month: 'junho',
    short: 'JUN',
    tribe: 'Naftali',
    fact: 'Baraque, que venceu Sísera ao lado de Débora, era de Naftali (Juízes 4:6).',
    gem: ['#FFFFFF', '#A9D8F2'],
  },
  {
    month: 'julho',
    short: 'JUL',
    tribe: 'Gade',
    fact: 'Ficou a leste do Jordão, mas seus guerreiros atravessaram para lutar com as outras tribos (Josué 4:12).',
    gem: ['#FFB27A', '#C4521E'],
  },
  {
    month: 'agosto',
    short: 'AGO',
    tribe: 'Aser',
    fact: 'A profetisa Ana, que viu o menino Jesus no templo, era da tribo de Aser (Lucas 2:36-38).',
    gem: ['#E6D2C0', '#8A6248'],
  },
  {
    month: 'setembro',
    short: 'SET',
    tribe: 'Issacar',
    fact: 'Seus homens eram conhecidos por entender os tempos e saber o que Israel devia fazer (1 Crônicas 12:32).',
    gem: ['#CDB8FF', '#6D35D9'],
  },
  {
    month: 'outubro',
    short: 'OUT',
    tribe: 'Zebulom',
    fact: 'Jesus morou em Cafarnaum, na terra de Zebulom e Naftali, onde começou a pregar (Mateus 4:13-17).',
    gem: ['#9CF2E8', '#1E9C99'],
  },
  {
    month: 'novembro',
    short: 'NOV',
    tribe: 'José',
    fact: 'Vendido pelos irmãos, governou o Egito; seus filhos Efraim e Manassés viraram duas tribos (Gênesis 48:5).',
    gem: ['#9CA3AF', '#1F2227'],
  },
  {
    month: 'dezembro',
    short: 'DEZ',
    tribe: 'Benjamim',
    fact: 'O caçula de Jacó; dela vieram o rei Saul e o apóstolo Paulo (1 Samuel 9:1-2; Filipenses 3:5).',
    gem: ['#F29AC2', '#9B2D63'],
  },
]

/** The trophy for a season named like "setembro de 2026" (January if unknown). */
export function trophyForSeason(seasonName: string): MonthTrophyStyle {
  const month = seasonName.split(' ')[0]?.toLowerCase()
  return MONTH_TROPHIES.find((trophy) => trophy.month === month) ?? MONTH_TROPHIES[0]
}

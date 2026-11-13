import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { Category, Difficulty, LeagueDetail, LeagueFormat } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthContext'
import { DIFFICULTY_LABELS } from '@/lib/format'
import { AppIcons, CategoryGlyph, Glyph } from '@/lib/icons'
import { SupporterNotice } from './PlayButton'

const MIN_NAME = 3
const MAX_NAME = 40
const MIN_CATEGORIES = 7
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert']
const MIN_ROUNDS = 1
const MAX_ROUNDS = 30
const MIN_QUESTIONS = 5
const MAX_QUESTIONS = 20
const TIMER_CHOICES = [10, 15, 20, 30, 45, 60]

const FORMATS: { value: LeagueFormat; title: string; text: string }[] = [
  {
    value: 'points',
    title: 'Pontos',
    text: 'Todos jogam todas as rodadas. Quem somar mais pontos até a data final é o campeão.',
  },
  {
    value: 'cup',
    title: 'Copa',
    text: 'Mata-mata em duelos, com chaveamento sorteado no início. Precisa de um número par de jogadores.',
  },
]

/** Local "YYYY-MM-DD", `days` from today, for the date field's limits. */
function isoDay(days: number): string {
  const day = new Date()
  day.setDate(day.getDate() + days)
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${day.getFullYear()}-${month}-${date}`
}

export function LeagueCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  })
  const [name, setName] = useState('')
  const [format, setFormat] = useState<LeagueFormat>('points')
  const [rounds, setRounds] = useState(5)
  const [endsOn, setEndsOn] = useState(isoDay(30))
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [difficulties, setDifficulties] = useState<Difficulty[]>(['easy', 'medium', 'hard'])
  const [questionCount, setQuestionCount] = useState(10)
  const [timerSeconds, setTimerSeconds] = useState(20)

  const create = useMutation({
    mutationFn: () =>
      api.post<LeagueDetail>('/leagues', {
        name: name.trim(),
        format,
        category_ids: categoryIds,
        difficulties,
        rounds: format === 'points' ? rounds : null,
        ends_on: endsOn,
        question_count: questionCount,
        timer_seconds: timerSeconds,
      }),
    onSuccess: (league) => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] })
      queryClient.setQueryData(['league', league.id], league)
      // Straight to the players: a league is nothing until someone is invited.
      navigate(`/leagues/${league.id}/players`, { replace: true })
    },
  })

  function toggleCategory(id: number) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  function toggleDifficulty(value: Difficulty) {
    setDifficulties((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    )
  }

  const all = categories ?? []
  const allSelected = all.length > 0 && categoryIds.length === all.length
  const nameLength = name.trim().length
  const nameOk = nameLength >= MIN_NAME
  const categoriesOk = categoryIds.length >= MIN_CATEGORIES
  const difficultiesOk = difficulties.length >= 1
  const roundsOk = format === 'cup' || (rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS)
  const questionsOk = questionCount >= MIN_QUESTIONS && questionCount <= MAX_QUESTIONS
  const valid = nameOk && categoriesOk && difficultiesOk && roundsOk && questionsOk && endsOn !== ''
  // What still blocks the button, in the order the form asks for it.
  const missing = [
    !nameOk && `um nome com pelo menos ${MIN_NAME} letras`,
    endsOn === '' && 'a data de encerramento',
    !roundsOk && `de ${MIN_ROUNDS} a ${MAX_ROUNDS} rodadas`,
    !questionsOk && `de ${MIN_QUESTIONS} a ${MAX_QUESTIONS} perguntas por partida`,
    !categoriesOk &&
      (categoryIds.length === 0
        ? `${MIN_CATEGORIES} temas`
        : `mais ${MIN_CATEGORIES - categoryIds.length} ${
            MIN_CATEGORIES - categoryIds.length === 1 ? 'tema' : 'temas'
          }`),
    !difficultiesOk && 'uma dificuldade',
  ].filter((item): item is string => Boolean(item))

  if (user && !user.is_supporter) {
    return (
      <div className="animate-float-up mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-extrabold">Criar liga</h1>
        <SupporterNotice />
        <Link to="/leagues" className="text-sm font-extrabold text-leaf-700 hover:underline">
          Voltar para as ligas
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <Link to="/leagues" className="text-xs font-extrabold text-leaf-700 hover:underline">
          ← Ligas
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">Criar liga</h1>
        <p className="text-sm font-semibold text-sand-500">
          Só entra quem você convidar. Até 20 jogadores.
        </p>
      </header>

      <Card className="space-y-4">
        <div>
          <Input
            label="Nome da liga"
            value={name}
            minLength={MIN_NAME}
            maxLength={MAX_NAME}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Liga da Célula"
            aria-describedby="league-name-hint"
          />
          <p
            id="league-name-hint"
            className={`mt-1.5 flex justify-between text-xs font-bold ${
              nameOk ? 'text-leaf-700' : 'text-sand-500'
            }`}
          >
            <span>Mínimo de {MIN_NAME} letras</span>
            <span className="tabular-nums">
              {nameLength}/{MAX_NAME}
            </span>
          </p>
        </div>
        <Input
          label="Data de encerramento"
          type="date"
          value={endsOn}
          min={isoDay(1)}
          max={isoDay(365)}
          onChange={(event) => setEndsOn(event.target.value)}
        />
        <p className="-mt-2 text-xs font-semibold text-sand-500">
          A liga vale até o fim desse dia. Depois dele ninguém joga mais.
        </p>
      </Card>

      <Card>
        <CardTitle>Formato</CardTitle>
        <div role="radiogroup" aria-label="Formato" className="grid gap-2 sm:grid-cols-2">
          {FORMATS.map((option) => {
            const selected = format === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFormat(option.value)}
                className={`rounded-2xl border-2 p-3 text-left transition-colors ${
                  selected
                    ? 'border-leaf-500 bg-leaf-50'
                    : 'border-sand-200 bg-white hover:bg-sand-50'
                }`}
              >
                <span className="flex items-center gap-2 font-extrabold text-ink">
                  <Glyph
                    as={option.value === 'cup' ? AppIcons.ranking : AppIcons.chart}
                    className="h-5 w-5 text-leaf-700"
                  />
                  {option.title}
                </span>
                <span className="mt-1 block text-xs font-semibold text-sand-600">
                  {option.text}
                </span>
              </button>
            )
          })}
        </div>
        {format === 'points' && (
          <div className="mt-4">
            <Input
              label="Quantas rodadas"
              type="number"
              inputMode="numeric"
              min={MIN_ROUNDS}
              max={MAX_ROUNDS}
              value={Number.isNaN(rounds) ? '' : rounds}
              onChange={(event) => setRounds(event.target.valueAsNumber)}
              error={roundsOk ? undefined : `De ${MIN_ROUNDS} a ${MAX_ROUNDS} rodadas`}
            />
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <CardTitle>Regras das partidas</CardTitle>
        <div>
          <Input
            label="Perguntas por partida"
            type="number"
            inputMode="numeric"
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
            value={Number.isNaN(questionCount) ? '' : questionCount}
            onChange={(event) => setQuestionCount(event.target.valueAsNumber)}
            error={questionsOk ? undefined : `De ${MIN_QUESTIONS} a ${MAX_QUESTIONS} perguntas`}
          />
          <p className="mt-1.5 text-xs font-semibold text-sand-500">
            De {MIN_QUESTIONS} a {MAX_QUESTIONS}. Em cada partida, todos respondem às mesmas
            perguntas.
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-sand-700">Tempo por pergunta</p>
          <div role="radiogroup" aria-label="Tempo por pergunta" className="flex flex-wrap gap-2">
            {TIMER_CHOICES.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={timerSeconds === seconds}
                onClick={() => setTimerSeconds(seconds)}
                className={`rounded-2xl px-3.5 py-2 text-sm font-extrabold shadow-card transition-colors ${
                  timerSeconds === seconds
                    ? 'bg-leaf-500 text-white'
                    : 'bg-white text-sand-600 hover:bg-sand-50'
                }`}
              >
                {seconds} s
              </button>
            ))}
          </div>
        </div>
        {format === 'cup' && (
          <p className="text-xs font-semibold text-sand-500">
            Na copa, cada duelo tem 24 horas para ser jogado. Quem não jogar no prazo perde por W.O.
            e a chave segue.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Temas</CardTitle>
        <div className="mb-3 -mt-2 flex flex-wrap items-center justify-between gap-2">
          <p
            className={`text-xs font-bold ${categoriesOk ? 'text-leaf-700' : 'text-sand-500'}`}
            aria-live="polite"
          >
            {categoryIds.length} {categoryIds.length === 1 ? 'escolhido' : 'escolhidos'} · mínimo{' '}
            {MIN_CATEGORIES}
          </p>
          <button
            type="button"
            onClick={() => setCategoryIds(allSelected ? [] : all.map((category) => category.id))}
            className="text-xs font-extrabold text-leaf-700 hover:underline"
          >
            {allSelected ? 'Limpar' : 'Selecionar todos'}
          </button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6 text-leaf-500" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {all.map((category) => (
              <Chip
                key={category.id}
                selected={categoryIds.includes(category.id)}
                onClick={() => toggleCategory(category.id)}
              >
                <CategoryGlyph slug={category.slug} emoji={category.icon} className="h-4 w-4" />
                {category.name}
              </Chip>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Dificuldades</CardTitle>
        <p className="mb-3 -mt-2 text-xs font-semibold text-sand-500">Pelo menos uma.</p>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTIES.map((value) => (
            <Chip
              key={value}
              selected={difficulties.includes(value)}
              onClick={() => toggleDifficulty(value)}
            >
              {DIFFICULTY_LABELS[value]}
            </Chip>
          ))}
        </div>
      </Card>

      {create.isError && (
        <p role="alert" className="text-sm font-bold text-red-600">
          {create.error instanceof ApiError
            ? create.error.message
            : 'Não foi possível criar a liga.'}
        </p>
      )}
      {missing.length > 0 && (
        <p className="text-sm font-semibold text-sand-600" aria-live="polite">
          <strong className="font-extrabold text-ink">Para criar a liga, falta:</strong>{' '}
          {missing.join('; ')}.
        </p>
      )}
      <Button full disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
        Criar liga e convidar jogadores
      </Button>
    </div>
  )
}

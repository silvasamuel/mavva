import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { Achievement, QuizComplete } from '@/types/api'
import { RankBadge } from '@/components/RankBadge'
import { RankLadder } from '@/components/RankLadder'
import { Button } from '@/components/ui/Button'
import { formatStudyTime } from '@/lib/format'
import { RANK_FLAVOR, isRankCode } from '@/lib/ranks'
import { playFanfare, playRankUp } from '@/lib/sfx'
import { AchievementGlyph, AppIcons, Glyph } from '@/lib/icons'

type Beat =
  | { kind: 'hero' }
  | { kind: 'xp' }
  | { kind: 'streak' }
  | { kind: 'goal' }
  | { kind: 'rank' }
  | { kind: 'level' }
  | { kind: 'achievement'; achievement: Achievement }
  | { kind: 'done' }

export function QuizSummaryPage() {
  const location = useLocation()
  const summary = location.state as QuizComplete | null
  const [step, setStep] = useState(0)
  const [shownXp, setShownXp] = useState(0)

  const beats = useMemo<Beat[]>(() => {
    if (!summary) return []
    const items: Beat[] = [{ kind: 'hero' }, { kind: 'xp' }]
    if (summary.streak.current > 0) items.push({ kind: 'streak' })
    if (summary.daily_goal.achieved) items.push({ kind: 'goal' })
    if (summary.rank?.rank_up) items.push({ kind: 'rank' })
    else if (summary.level.leveled_up) items.push({ kind: 'level' })
    for (const achievement of summary.unlocked_achievements) {
      items.push({ kind: 'achievement', achievement })
    }
    items.push({ kind: 'done' })
    return items
  }, [summary])

  const beat = beats[step]
  const last = step >= beats.length - 1

  useEffect(() => {
    if (!summary) return
    playFanfare()
  }, [summary])

  useEffect(() => {
    if (beat?.kind === 'rank') playRankUp()
  }, [beat])

  const achievementXp = summary
    ? summary.unlocked_achievements.reduce((total, item) => total + (item.xp_reward ?? 0), 0)
    : 0
  const totalXp = summary ? summary.xp_earned + achievementXp : 0

  useEffect(() => {
    if (beat?.kind !== 'xp') return
    const target = totalXp
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 700)
      setShownXp(Math.round(target * t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [beat, totalXp])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Enter' || last) return
      event.preventDefault()
      setStep((current) => current + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  if (!summary || !beat) return <Navigate to="/" replace />

  const perfect = summary.correct_count === summary.question_count
  const headline = perfect
    ? 'Sessão perfeita!'
    : summary.accuracy >= 0.7
      ? 'Muito bem!'
      : 'Semente plantada'

  function advance() {
    if (!last) setStep((current) => current + 1)
  }

  return (
    <div
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10"
      onClick={last ? undefined : advance}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.92, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="text-center"
        >
          {beat.kind === 'hero' && (
            <>
              <span className="mx-auto flex justify-center text-leaf-600">
                <Glyph
                  as={perfect ? AppIcons.sparkle : summary.accuracy >= 0.7 ? AppIcons.confetti : AppIcons.plant}
                  className="h-16 w-16"
                />
              </span>
              <h1 className="mt-4 text-4xl font-extrabold">{headline}</h1>
              <p className="mt-2 text-lg font-extrabold text-sand-600">
                {summary.correct_count}/{summary.question_count} acertos
              </p>
              <p className="mt-6 text-sm font-bold text-sand-400">Toque para continuar</p>
            </>
          )}

          {beat.kind === 'xp' && (
            <>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sand-500">
                XP desta partida
              </p>
              <p
                className={`mt-3 text-6xl font-extrabold ${
                  totalXp >= 0 ? 'text-grain-700' : 'text-red-600'
                }`}
              >
                {shownXp >= 0 ? `+${shownXp}` : shownXp}
              </p>
              <p className="mt-2 text-sm font-bold text-sand-500">
                {formatStudyTime(summary.duration_seconds)} de estudo
              </p>
            </>
          )}

          {beat.kind === 'streak' && (
            <>
              <span className="mx-auto flex justify-center text-grain-600">
                <Glyph as={AppIcons.streak} className="h-16 w-16" />
              </span>
              <h2 className="mt-4 text-3xl font-extrabold">
                {summary.streak.current} {summary.streak.current === 1 ? 'dia' : 'dias'}
              </h2>
              <p className="mt-2 font-bold text-sand-600">
                {summary.streak.extended_today ? 'A chama cresceu hoje.' : 'Sequência mantida.'}
              </p>
            </>
          )}

          {beat.kind === 'goal' && (
            <>
              <span className="mx-auto flex justify-center text-grain-600">
                <Glyph as={AppIcons.manna} className="h-16 w-16" />
              </span>
              <h2 className="mt-4 text-3xl font-extrabold">Maná recolhido</h2>
              <p className="mt-2 font-bold text-sand-600">
                Meta de {summary.daily_goal.target} XP cumprida.
              </p>
            </>
          )}

          {beat.kind === 'rank' && (
            <>
              <RankBadge code={summary.rank.code} size="lg" />
              <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.2em] text-grain-700">
                Novo grau
              </p>
              <h2 className="mt-1 text-3xl font-extrabold">{summary.rank.name}</h2>
              {isRankCode(summary.rank.code) && (
                <p className="mt-2 font-bold text-sand-600">{RANK_FLAVOR[summary.rank.code]}</p>
              )}
              <div className="mt-6 text-left">
                <RankLadder currentCode={summary.rank.code} level={summary.level.current} />
              </div>
            </>
          )}

          {beat.kind === 'level' && (
            <>
              <span className="mx-auto flex justify-center text-leaf-600">
                <Glyph as={AppIcons.levelUp} className="h-16 w-16" />
              </span>
              <h2 className="mt-4 text-3xl font-extrabold">Nível {summary.level.current}</h2>
              <p className="mt-2 font-bold text-sand-600">Você subiu de nível.</p>
            </>
          )}

          {beat.kind === 'achievement' && (
            <>
              <span className="mx-auto flex justify-center text-grain-700">
                <AchievementGlyph code={beat.achievement.code} className="h-16 w-16" />
              </span>
              <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.2em] text-grain-700">
                Conquista
              </p>
              <h2 className="mt-1 text-3xl font-extrabold">{beat.achievement.name}</h2>
              <p className="mt-2 font-bold text-sand-600">{beat.achievement.description}</p>
              {beat.achievement.xp_reward > 0 && (
                <p className="mt-3 text-sm font-extrabold text-grain-700">
                  +{beat.achievement.xp_reward} XP
                </p>
              )}
            </>
          )}

          {beat.kind === 'done' && (
            <div className="space-y-6" onClick={(event) => event.stopPropagation()}>
              <div>
                <h2 className="text-3xl font-extrabold">Celeiro guardado</h2>
                <p className="mt-2 font-bold text-sand-600">
                  {summary.correct_count}/{summary.question_count} ·{' '}
                  {totalXp >= 0 ? `+${totalXp}` : totalXp} XP
                </p>
              </div>
              {/* Side by side "Jogar de novo" wraps under ~370px wide; stack there. */}
              <div className="flex flex-col gap-3 min-[370px]:flex-row">
                <Link to="/quiz/new" className="flex-1">
                  <Button variant="secondary" full>
                    Jogar de novo
                  </Button>
                </Link>
                <Link to="/" className="flex-1">
                  <Button full>Início</Button>
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

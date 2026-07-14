import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { QuizComplete } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatStudyTime } from '@/lib/format'

const stagger = {
  hidden: { opacity: 0, y: 16 },
  show: (order: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 * order, duration: 0.3 },
  }),
}

export function QuizSummaryPage() {
  const location = useLocation()
  const summary = location.state as QuizComplete | null

  if (!summary) return <Navigate to="/" replace />

  const perfect = summary.correct_count === summary.question_count
  const headline = perfect
    ? 'Sessão perfeita! 🌟'
    : summary.accuracy >= 0.7
      ? 'Muito bem! 🙌'
      : 'Semente plantada 🌱'

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-4 py-10">
      <motion.h1
        custom={0}
        variants={stagger}
        initial="hidden"
        animate="show"
        className="text-center text-3xl font-extrabold"
      >
        {headline}
      </motion.h1>

      <motion.div custom={1} variants={stagger} initial="hidden" animate="show" className="w-full">
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-leaf-600">
              {summary.correct_count}/{summary.question_count}
            </p>
            <p className="text-xs font-bold uppercase text-sand-500">corretas</p>
          </Card>
          <Card className="text-center">
            <motion.p
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.3 }}
              className={`text-2xl font-extrabold ${
                summary.xp_earned >= 0 ? 'text-grain-600' : 'text-red-600'
              }`}
            >
              {summary.xp_earned >= 0 ? `+${summary.xp_earned}` : summary.xp_earned}
            </motion.p>
            <p className="text-xs font-bold uppercase text-sand-500">XP</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold">{formatStudyTime(summary.duration_seconds)}</p>
            <p className="text-xs font-bold uppercase text-sand-500">tempo</p>
          </Card>
        </div>
      </motion.div>

      <motion.div
        custom={2}
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex w-full flex-col gap-3"
      >
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              🔥
            </span>
            <p className="font-extrabold">
              {summary.streak.current} {summary.streak.current === 1 ? 'dia' : 'dias'} de sequência
            </p>
          </div>
          {summary.streak.extended_today && (
            <span className="rounded-full bg-grain-100 px-3 py-1 text-xs font-extrabold text-grain-700">
              +1 hoje!
            </span>
          )}
        </Card>

        {summary.level.leveled_up && (
          <Card className="flex items-center gap-3 bg-leaf-50 ring-1 ring-leaf-200">
            <span className="text-2xl" aria-hidden>
              ⬆️
            </span>
            <p className="font-extrabold text-leaf-800">
              Você subiu para o nível {summary.level.current}!
            </p>
          </Card>
        )}

        {summary.daily_goal.achieved && (
          <Card className="flex items-center gap-3 bg-grain-50 ring-1 ring-grain-200">
            <span className="text-2xl" aria-hidden>
              🎯
            </span>
            <p className="font-extrabold text-grain-800">Meta diária cumprida — maná recolhido!</p>
          </Card>
        )}

        {summary.unlocked_achievements.map((achievement) => (
          <motion.div
            key={achievement.code}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.5 }}
          >
            <Card className="flex items-center gap-3 bg-grain-50 ring-2 ring-grain-300">
              <span className="text-3xl" aria-hidden>
                {achievement.icon}
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-grain-600">
                  Conquista desbloqueada
                </p>
                <p className="font-extrabold">{achievement.name}</p>
                <p className="text-xs font-semibold text-sand-600">{achievement.description}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        custom={3}
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex w-full gap-3"
      >
        <Link to="/quiz/new" className="flex-1">
          <Button variant="secondary" full>
            Estudar de novo
          </Button>
        </Link>
        <Link to="/" className="flex-1">
          <Button full>Ver painel</Button>
        </Link>
      </motion.div>
    </div>
  )
}

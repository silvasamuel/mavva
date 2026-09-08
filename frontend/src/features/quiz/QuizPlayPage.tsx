import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/api'
import type {
  AnswerFeedback,
  DashboardData,
  QuizAbandonResult,
  QuizComplete,
  QuizQuestion,
  QuizSession,
} from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { GameHud } from '@/components/GameHud'
import { DIFFICULTY_LABELS } from '@/lib/format'
import { playCorrect, playWrong } from '@/lib/sfx'
import { AppIcons, CategoryGlyph, Glyph } from '@/lib/icons'
import { ReportQuestionModal } from '@/features/moderation/ReportQuestionModal'

interface AnswerPayload {
  question_id: string
  selected_option_id?: string
  answer_text?: string
  timed_out?: boolean
}

export function QuizPlayPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: session, isLoading } = useQuery({
    queryKey: ['quiz', sessionId],
    queryFn: () => api.get<QuizSession>(`/quizzes/${sessionId}`),
    staleTime: Infinity,
  })
  const { data: dash } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })

  // Resume where the user left off (server knows what was answered).
  const firstUnanswered = useMemo(
    () => session?.questions.findIndex((question) => !question.answered) ?? 0,
    [session]
  )
  const [index, setIndex] = useState<number | null>(null)
  const currentIndex = index ?? Math.max(0, firstUnanswered)

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [error, setError] = useState('')
  const [exitConfirm, setExitConfirm] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportedIds, setReportedIds] = useState<string[]>([])
  // Wrong/answered beyond what the session snapshot knew at load time.
  const [extraWrong, setExtraWrong] = useState(0)
  const [extraAnswered, setExtraAnswered] = useState(0)
  const questionStartedAt = useRef(Date.now())

  const question: QuizQuestion | undefined = session?.questions[currentIndex]
  const isLast = session ? currentIndex >= session.questions.length - 1 : false
  const timerSeconds = session?.timer_seconds ?? null
  // The API already serves options shuffled per session (server-side, so the
  // answer position cannot be inferred by calling it directly).
  const displayOptions = question?.options ?? []
  const [remaining, setRemaining] = useState<number | null>(null)

  const wrongTotal = session
    ? session.answered_count - session.correct_count + extraWrong
    : extraWrong
  const answeredTotal = (session?.answered_count ?? 0) + extraAnswered

  const submitAnswer = useMutation({
    mutationFn: (payload: AnswerPayload) =>
      api.post<AnswerFeedback>(`/quizzes/${sessionId}/answers`, {
        ...payload,
        time_spent_seconds: Math.min(
          3600,
          timerSeconds != null && remaining != null
            ? Math.max(0, timerSeconds - remaining)
            : Math.round((Date.now() - questionStartedAt.current) / 1000)
        ),
      }),
    onSuccess: (result) => {
      if (result.is_correct) playCorrect()
      else playWrong()
      setFeedback(result)
      setExtraAnswered((count) => count + 1)
      if (!result.is_correct) setExtraWrong((count) => count + 1)
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.message.includes('já foi respondida')) {
        await queryClient.invalidateQueries({ queryKey: ['quiz', sessionId] })
        setIndex(null)
        setFeedback(null)
        setError('')
        return
      }
      if (err instanceof ApiError && err.message.includes('Alternativa inválida')) {
        await queryClient.invalidateQueries({ queryKey: ['quiz', sessionId] })
        setSelectedOption(null)
        setError('As alternativas foram atualizadas. Escolha de novo.')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a resposta.')
    },
  })

  const completeQuiz = useMutation({
    mutationFn: () => api.post<QuizComplete>(`/quizzes/${sessionId}/complete`),
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      if (session?.duel_id) {
        // Duel rounds end on the head-to-head scoreboard, not the solo summary.
        queryClient.invalidateQueries({ queryKey: ['duels'] })
        navigate(`/duels/${session.duel_id}`, { replace: true })
        return
      }
      navigate(`/quiz/${sessionId}/summary`, { state: summary, replace: true })
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o quiz.'),
  })

  const abandonQuiz = useMutation({
    mutationFn: () => api.post<QuizAbandonResult>(`/quizzes/${sessionId}/abandon`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.removeQueries({ queryKey: ['quiz', sessionId] })
      if (session?.duel_id) {
        queryClient.invalidateQueries({ queryKey: ['duels'] })
        navigate(`/duels/${session.duel_id}`, { replace: true })
        return
      }
      navigate('/')
    },
  })

  // Countdown is anchored on the server (presented_at). Reload keeps elapsed time.
  useEffect(() => {
    if (!timerSeconds || !question || feedback || question.answered || !sessionId) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    ;(async () => {
      let start = question.timer_remaining ?? timerSeconds
      setRemaining(start)
      try {
        const data = await api.post<{ timer_remaining: number | null }>(
          `/quizzes/${sessionId}/present`,
          { question_id: question.id }
        )
        if (data.timer_remaining != null) start = data.timer_remaining
      } catch {
        /* keep the snapshot from GET */
      }
      if (cancelled) return
      const deadline = Date.now() + start * 1000
      const tick = () =>
        setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
      tick()
      interval = setInterval(tick, 250)
    })()

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [timerSeconds, question, feedback, sessionId])

  const handleSubmit = useCallback(() => {
    setError('')
    if (!question || feedback || submitAnswer.isPending) return
    if (question.type === 'multiple_choice') {
      if (!selectedOption) return
      submitAnswer.mutate({ question_id: question.id, selected_option_id: selectedOption })
    } else {
      if (!answerText.trim()) return
      submitAnswer.mutate({ question_id: question.id, answer_text: answerText })
    }
  }, [question, feedback, selectedOption, answerText, submitAnswer])

  const handleNext = useCallback(() => {
    if (completeQuiz.isPending) return
    setFeedback(null)
    setTimedOut(false)
    setSelectedOption(null)
    setAnswerText('')
    setRemaining(null)
    setReportOpen(false)
    questionStartedAt.current = Date.now()
    if (isLast) {
      completeQuiz.mutate()
    } else {
      setIndex(currentIndex + 1)
    }
  }, [completeQuiz, isLast, currentIndex])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (exitConfirm || reportOpen) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (typing) return

      if (event.key === 'Enter') {
        event.preventDefault()
        if (feedback) handleNext()
        else handleSubmit()
        return
      }

      if (feedback || submitAnswer.isPending || question?.type !== 'multiple_choice') return
      if (event.key.length !== 1) return
      const index = event.key.toUpperCase().charCodeAt(0) - 65
      if (index < 0 || index >= displayOptions.length) return
      event.preventDefault()
      setSelectedOption(displayOptions[index].id)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    exitConfirm,
    reportOpen,
    feedback,
    handleNext,
    handleSubmit,
    submitAnswer.isPending,
    question?.type,
    displayOptions,
  ])

  // Time's up: auto-submit as a miss.
  useEffect(() => {
    if (remaining !== 0 || !question || feedback || submitAnswer.isPending) return
    setTimedOut(true)
    submitAnswer.mutate({ question_id: question.id, timed_out: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  if (isLoading || !session || !question) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const answeredSoFar = session.answered_count + extraAnswered
  const timerUrgent = remaining !== null && remaining <= 5
  const questionNumber = Math.min(currentIndex + 1, session.question_count)

    return (
    <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-4">
      <div className="mb-3">
        <GameHud
          rankCode={dash?.stats.rank.code}
          rankName={dash?.stats.rank.name}
          level={dash?.stats.level}
          xpInto={dash?.stats.xp_into_level}
          xpForNext={dash?.stats.xp_for_next_level}
          streak={dash?.stats.current_streak}
        />
      </div>
      {/* Top bar */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setExitConfirm(true)}
          aria-label="Sair do quiz"
          className="text-2xl text-sand-400 transition-colors hover:text-sand-600"
        >
          ✕
        </button>
        <ProgressBar value={answeredSoFar} max={session.question_count} className="h-5 flex-1" />
        {timerSeconds != null && (
          <motion.span
            key={timerUrgent ? 'urgent' : 'calm'}
            animate={timerUrgent && !feedback ? { scale: [1, 1.12, 1] } : {}}
            transition={{ repeat: timerUrgent && !feedback ? Infinity : 0, duration: 1 }}
            className={`min-w-[3.25rem] rounded-full px-2.5 py-1 text-center text-sm font-extrabold tabular-nums ${
              feedback || remaining === null
                ? 'invisible'
                : timerUrgent
                  ? 'bg-red-100 text-red-600'
                  : 'bg-sand-100 text-sand-600'
            }`}
            role="timer"
            aria-hidden={Boolean(feedback) || remaining === null}
            aria-label={remaining != null ? `${remaining} segundos restantes` : undefined}
          >
            <span className="inline-flex items-center gap-1">
              <Glyph as={AppIcons.timer} className="h-3.5 w-3.5" />
              {remaining ?? timerSeconds}s
            </span>
          </motion.span>
        )}
        <span className="text-sm font-extrabold text-sand-500">
          {questionNumber}/{session.question_count}
        </span>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
          className="flex flex-1 flex-col gap-5 py-8"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-sand-500">
            <CategoryGlyph emoji={question.category_icon} className="h-4 w-4" />
            {question.category_name}
            <span className="rounded-full bg-sand-100 px-2 py-0.5">
              {DIFFICULTY_LABELS[question.difficulty]}
            </span>
          </div>

          <h1 className="text-xl font-extrabold leading-snug md:text-2xl">{question.text}</h1>

          {question.type === 'multiple_choice' ? (
            <div className="grid gap-3" role="radiogroup" aria-label="Alternativas">
              {displayOptions.map((option, optionIndex) => {
                const isSelected = selectedOption === option.id
                const isCorrectOption = feedback?.correct_option_id === option.id
                const isWrongPick = feedback && isSelected && !feedback.is_correct

                let styles = 'border-sand-200 bg-white hover:bg-sand-50'
                if (!feedback && isSelected)
                  styles = 'border-leaf-500 bg-leaf-50 ring-1 ring-leaf-300'
                if (isCorrectOption) styles = 'border-leaf-600 bg-leaf-100'
                if (isWrongPick) styles = 'border-red-400 bg-red-50'

                return (
                  <motion.button
                    key={option.id}
                    role="radio"
                    aria-checked={isSelected}
                    aria-keyshortcuts={String.fromCharCode(65 + optionIndex)}
                    disabled={Boolean(feedback)}
                    onClick={() => setSelectedOption(option.id)}
                    animate={isWrongPick ? { x: [0, -8, 8, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm font-bold transition-colors disabled:cursor-default ${styles}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                        isCorrectOption
                          ? 'bg-leaf-500 text-white'
                          : isWrongPick
                            ? 'bg-red-400 text-white'
                            : 'bg-sand-100 text-sand-500'
                      }`}
                      aria-hidden
                    >
                      {isCorrectOption
                        ? '✓'
                        : isWrongPick
                          ? '✗'
                          : String.fromCharCode(65 + optionIndex)}
                    </span>
                    {option.text}
                  </motion.button>
                )
              })}
            </div>
          ) : (
            <input
              autoFocus
              value={answerText}
              disabled={Boolean(feedback)}
              onChange={(e) => setAnswerText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !feedback && handleSubmit()}
              placeholder="Digite sua resposta…"
              aria-label="Sua resposta"
              className={`rounded-2xl border-2 bg-white px-4 py-4 text-lg font-bold focus-visible:ring-0 ${
                feedback
                  ? feedback.is_correct
                    ? 'border-leaf-500 bg-leaf-50'
                    : 'border-red-400 bg-red-50'
                  : 'border-sand-200 focus:border-leaf-500'
              }`}
            />
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {!feedback && (
        <div className="sticky bottom-0 -mx-4 border-t-2 border-sand-200/60 bg-[#f4efe0]/90 px-4 py-4 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl">
            <Button
              full
              className="relative"
              onClick={handleSubmit}
              loading={submitAnswer.isPending}
              disabled={question.type === 'multiple_choice' ? !selectedOption : !answerText.trim()}
            >
              Responder
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-[#f4efe0] px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-leaf-700">
                ENTER
              </span>
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {feedback && (
          <motion.div
            key="splash"
            role="dialog"
            aria-modal="true"
            aria-label={feedback.is_correct ? 'Resposta correta' : 'Resposta incorreta'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-40 flex flex-col overflow-y-auto px-4 py-8 ${
              feedback.is_correct
                ? 'bg-leaf-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            <div className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center gap-5">
              <motion.p
                initial={{ scale: 0.6, y: 24 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 16 }}
                className="text-center text-5xl font-extrabold leading-none sm:text-6xl"
              >
                {feedback.is_correct ? 'Correto!' : timedOut ? 'Tempo!' : 'Errou'}
              </motion.p>
              {feedback.xp_earned !== 0 && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-center text-2xl font-extrabold text-grain-200"
                >
                  {feedback.xp_earned > 0 ? `+${feedback.xp_earned}` : feedback.xp_earned} XP
                </motion.p>
              )}
              {!feedback.is_correct && feedback.correct_answer && (
                <p className="text-center text-lg font-extrabold">
                  Resposta: {feedback.correct_answer}
                </p>
              )}
              <p className="text-center text-sm font-bold leading-relaxed text-white/90">
                {feedback.explanation}
              </p>
              <p className="mx-auto rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold">
                {feedback.reference.display}
              </p>
              {feedback.divergence_note && (
                <p className="rounded-2xl bg-black/15 px-4 py-3 text-xs font-semibold leading-relaxed">
                  {feedback.divergence_note}
                </p>
              )}
              {reportedIds.includes(question.id) ? (
                <p className="text-center text-xs font-semibold text-white/70">Obrigado pelo aviso.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="mx-auto text-xs font-semibold text-white/70 underline-offset-2 hover:text-white hover:underline"
                >
                  Há um problema nesta pergunta?
                </button>
              )}
              <Button
                full
                variant="gold"
                onClick={handleNext}
                loading={completeQuiz.isPending}
              >
                {isLast ? 'Ver resultado' : 'Continuar'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit confirmation with penalty warning */}
      <AnimatePresence>
        {exitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar saída"
          >
            <motion.div
              initial={{ scale: 0.92, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-card"
            >
              <span className="mx-auto flex justify-center text-red-600">
                <Glyph
                  as={session?.duel_id ? AppIcons.flag : wrongTotal > 0 ? AppIcons.warning : AppIcons.sad}
                  className="h-10 w-10"
                />
              </span>
              <p className="font-extrabold">
                {session?.duel_id ? 'Desistir do duelo?' : 'Sair sem terminar?'}
              </p>
              {session?.duel_id ? (
                <p className="text-sm font-semibold text-sand-600">
                  Sair agora <strong>cancela o duelo</strong>: conta como{' '}
                  <strong className="text-red-600">derrota (−25 XP)</strong> e a vitória vai para o
                  seu adversário.
                </p>
              ) : wrongTotal > 0 ? (
                <p className="text-sm font-semibold text-sand-600">
                  Você errou{' '}
                  <strong className="text-red-600">
                    {wrongTotal} {wrongTotal === 1 ? 'pergunta' : 'perguntas'}
                  </strong>{' '}
                  nesta sessão. Ao sair, a penalidade dos erros é aplicada ao seu XP e você{' '}
                  <strong>abre mão de todo o XP ganho</strong> — só quem termina recebe.
                </p>
              ) : answeredTotal > 0 ? (
                <p className="text-sm font-semibold text-sand-600">
                  Ao sair, você <strong>abre mão do XP ganho</strong> nesta sessão — só quem
                  termina recebe.
                </p>
              ) : (
                <p className="text-sm font-semibold text-sand-600">
                  Você ainda não respondeu nada — pode sair sem penalidade.
                </p>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" full onClick={() => setExitConfirm(false)}>
                  Continuar
                </Button>
                <Button
                  variant="danger"
                  full
                  loading={abandonQuiz.isPending}
                  onClick={() => abandonQuiz.mutate()}
                >
                  {session?.duel_id ? 'Desistir' : 'Sair'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportQuestionModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onReported={() =>
          setReportedIds((current) =>
            current.includes(question.id) ? current : [...current, question.id]
          )
        }
        questionId={question.id}
        sessionId={session.id}
      />
    </div>
  )
}

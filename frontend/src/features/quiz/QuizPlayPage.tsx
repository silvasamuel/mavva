import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/api'
import type { AnswerFeedback, QuizComplete, QuizQuestion, QuizSession } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { DIFFICULTY_LABELS } from '@/lib/format'

export function QuizPlayPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: session, isLoading } = useQuery({
    queryKey: ['quiz', sessionId],
    queryFn: () => api.get<QuizSession>(`/quizzes/${sessionId}`),
    staleTime: Infinity,
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
  const [error, setError] = useState('')
  const [exitConfirm, setExitConfirm] = useState(false)
  const questionStartedAt = useRef(Date.now())

  const question: QuizQuestion | undefined = session?.questions[currentIndex]
  const isLast = session ? currentIndex >= session.questions.length - 1 : false

  const submitAnswer = useMutation({
    mutationFn: (payload: {
      question_id: string
      selected_option_id?: string
      answer_text?: string
    }) =>
      api.post<AnswerFeedback>(`/quizzes/${sessionId}/answers`, {
        ...payload,
        time_spent_seconds: Math.min(3600, Math.round((Date.now() - questionStartedAt.current) / 1000)),
      }),
    onSuccess: setFeedback,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a resposta.'),
  })

  const completeQuiz = useMutation({
    mutationFn: () => api.post<QuizComplete>(`/quizzes/${sessionId}/complete`),
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      navigate(`/quiz/${sessionId}/summary`, { state: summary, replace: true })
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o quiz.'),
  })

  if (isLoading || !session || !question) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  function handleSubmit() {
    setError('')
    if (!question) return
    if (question.type === 'multiple_choice') {
      if (!selectedOption) return
      submitAnswer.mutate({ question_id: question.id, selected_option_id: selectedOption })
    } else {
      if (!answerText.trim()) return
      submitAnswer.mutate({ question_id: question.id, answer_text: answerText })
    }
  }

  function handleNext() {
    setFeedback(null)
    setSelectedOption(null)
    setAnswerText('')
    questionStartedAt.current = Date.now()
    if (isLast) {
      completeQuiz.mutate()
    } else {
      setIndex(currentIndex + 1)
    }
  }

  const answeredSoFar = currentIndex + (feedback ? 1 : 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6">
      {/* Top bar */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setExitConfirm(true)}
          aria-label="Sair do quiz"
          className="text-2xl text-sand-400 transition-colors hover:text-sand-600"
        >
          ✕
        </button>
        <ProgressBar value={answeredSoFar} max={session.question_count} className="flex-1 h-5" />
        <span className="text-sm font-extrabold text-sand-500">
          {Math.min(answeredSoFar + (feedback ? 0 : 1), session.question_count)}/{session.question_count}
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
            <span aria-hidden>{question.category_icon}</span>
            {question.category_name}
            <span className="rounded-full bg-sand-100 px-2 py-0.5">
              {DIFFICULTY_LABELS[question.difficulty]}
            </span>
          </div>

          <h1 className="text-xl font-extrabold leading-snug md:text-2xl">{question.text}</h1>

          {question.type === 'multiple_choice' ? (
            <div className="grid gap-3" role="radiogroup" aria-label="Alternativas">
              {question.options.map((option, optionIndex) => {
                const isSelected = selectedOption === option.id
                const isCorrectOption = feedback?.correct_option_id === option.id
                const isWrongPick = feedback && isSelected && !feedback.is_correct

                let styles = 'border-sand-200 bg-white hover:bg-sand-50'
                if (!feedback && isSelected) styles = 'border-leaf-500 bg-leaf-50 ring-1 ring-leaf-300'
                if (isCorrectOption) styles = 'border-leaf-600 bg-leaf-100'
                if (isWrongPick) styles = 'border-red-400 bg-red-50'

                return (
                  <motion.button
                    key={option.id}
                    role="radio"
                    aria-checked={isSelected}
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
                      {isCorrectOption ? '✓' : isWrongPick ? '✗' : String.fromCharCode(65 + optionIndex)}
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

      {/* Feedback / actions footer */}
      <div className="sticky bottom-0 -mx-4 border-t-2 border-sand-100 bg-sand-25 px-4 py-4">
        <AnimatePresence mode="wait">
          {feedback ? (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-2xl space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p
                  className={`flex items-center gap-2 text-lg font-extrabold ${
                    feedback.is_correct ? 'text-leaf-700' : 'text-red-600'
                  }`}
                >
                  <span aria-hidden>{feedback.is_correct ? '🎉' : '💭'}</span>
                  {feedback.is_correct ? 'Correto!' : 'Não foi dessa vez'}
                </p>
                {feedback.xp_earned !== 0 && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    className={`rounded-full px-3 py-1 text-sm font-extrabold ${
                      feedback.xp_earned > 0
                        ? 'bg-grain-100 text-grain-700'
                        : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {feedback.xp_earned > 0 ? `+${feedback.xp_earned}` : feedback.xp_earned} XP
                  </motion.span>
                )}
              </div>

              {!feedback.is_correct && feedback.correct_answer && (
                <p className="text-sm font-bold">
                  Resposta: <span className="text-leaf-700">{feedback.correct_answer}</span>
                </p>
              )}

              <p className="text-sm font-semibold leading-relaxed text-sand-700">
                {feedback.explanation}
              </p>

              <p className="inline-block rounded-full bg-leaf-50 px-3 py-1 text-xs font-extrabold text-leaf-700 ring-1 ring-leaf-200">
                📖 {feedback.reference.display}
              </p>

              {feedback.divergence_note && (
                <p className="rounded-2xl bg-grain-50 px-4 py-3 text-xs font-semibold leading-relaxed text-grain-800 ring-1 ring-grain-200">
                  <strong>Nota:</strong> {feedback.divergence_note}
                </p>
              )}

              <Button full onClick={handleNext} loading={completeQuiz.isPending} variant={feedback.is_correct ? 'primary' : 'secondary'}>
                {isLast ? 'Ver resultado' : 'Continuar'}
              </Button>
            </motion.div>
          ) : (
            <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-2xl">
              <Button
                full
                onClick={handleSubmit}
                loading={submitAnswer.isPending}
                disabled={question.type === 'multiple_choice' ? !selectedOption : !answerText.trim()}
              >
                Responder
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Exit confirmation */}
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
              <span className="text-4xl" aria-hidden>
                🥺
              </span>
              <p className="font-extrabold">Sair do quiz?</p>
              <p className="text-sm font-semibold text-sand-500">
                Seu progresso nas perguntas respondidas fica salvo — você pode voltar depois.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" full onClick={() => setExitConfirm(false)}>
                  Continuar
                </Button>
                <Button variant="danger" full onClick={() => navigate('/')}>
                  Sair
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

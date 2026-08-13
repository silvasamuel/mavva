import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { FlagCreateResponse, FlagReason } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FLAG_REASON_LABELS } from '@/lib/format'

const REASONS: FlagReason[] = ['wrong_text', 'wrong_answer', 'wrong_reference', 'other']

export function ReportQuestionModal({
  open,
  onClose,
  onReported,
  questionId,
  sessionId,
}: {
  open: boolean
  onClose: () => void
  onReported: () => void
  questionId: string
  sessionId: string
}) {
  const [reason, setReason] = useState<FlagReason>('wrong_text')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason('wrong_text')
    setComment('')
    setError('')
    setDone(false)
  }, [open, questionId])

  const submit = useMutation({
    mutationFn: () =>
      api.post<FlagCreateResponse>('/flags', {
        question_id: questionId,
        reason,
        comment: comment.trim() || null,
        session_id: sessionId,
      }),
    onSuccess: () => {
      setDone(true)
      onReported()
    },
    onError: (err) => {
      if (err instanceof ApiError && err.message.includes('já reportou')) {
        setDone(true)
        onReported()
        return
      }
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o report.')
    },
  })

  return (
    <Modal open={open} onClose={onClose} label="Reportar pergunta">
      <div className="space-y-4 text-left">
        {done ? (
          <>
            <p className="text-center text-3xl" aria-hidden>
              🙏
            </p>
            <p className="text-center font-extrabold">Obrigado, vamos revisar.</p>
            <Button full onClick={onClose}>
              Fechar
            </Button>
          </>
        ) : (
          <>
            <p className="text-center font-extrabold">Há um problema nesta pergunta?</p>
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-sand-700">Motivo</legend>
              {REASONS.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="radio"
                    name="flag-reason"
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="h-4 w-4 accent-leaf-500"
                  />
                  {FLAG_REASON_LABELS[value]}
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="flag-comment" className="block text-sm font-bold text-sand-700">
                Comentário (opcional)
              </label>
              <textarea
                id="flag-comment"
                value={comment}
                maxLength={500}
                rows={3}
                onChange={(event) => setComment(event.target.value)}
                className="w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 text-sm font-semibold focus:border-leaf-500 focus-visible:ring-0"
              />
              <p className="text-right text-xs font-semibold text-sand-400">{comment.length}/500</p>
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" full onClick={onClose}>
                Cancelar
              </Button>
              <Button full loading={submit.isPending} onClick={() => submit.mutate()}>
                Enviar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

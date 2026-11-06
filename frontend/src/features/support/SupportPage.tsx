import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { api, ApiError } from '@/lib/api'
import type { SupportPayment, SupportSummary } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate, formatReais } from '@/lib/format'
import { AppIcons, Glyph } from '@/lib/icons'

/** Offered amounts, in cents; the custom box takes anything in the API's range. */
const PRESETS = [500, 1000, 2000, 5000]
const MIN_CENTS = 100
const MAX_CENTS = 100_000
const POLL_MS = 5000

function parseReais(raw: string): number | null {
  const normalized = raw.replace(/[^\d,.]/g, '').replace(',', '.')
  if (!normalized) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

function minutesLeft(iso: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000))
}

function isOpen(payment: SupportPayment | null | undefined): payment is SupportPayment {
  return (
    !!payment && payment.status === 'pending' && new Date(payment.expires_at).getTime() > Date.now()
  )
}

/**
 * "Apoie o Mavva": pick an amount, pay the Pix, become a supporter. A pending
 * Pix survives a reload (the API hands back the latest charge) and is polled
 * until the provider confirms it or it expires.
 */
export function SupportPage() {
  const { user, updateUser } = useAuth()
  const queryClient = useQueryClient()
  const summary = useQuery({
    queryKey: ['support', 'me'],
    queryFn: () => api.get<SupportSummary>('/support/me'),
  })
  // The charge on screen: resumed from the summary or just created.
  const [payment, setPayment] = useState<SupportPayment | null>(null)
  const [resumed, setResumed] = useState(false)
  const [amount, setAmount] = useState<number>(PRESETS[1])
  const [custom, setCustom] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (resumed || !summary.data) return
    setResumed(true)
    const last = summary.data.last_payment
    if (last && isOpen(last)) setPayment(last)
  }, [summary.data, resumed])

  const pending = payment !== null && isOpen(payment)
  const paymentId = payment?.id
  const poll = useQuery({
    queryKey: ['support', 'payment', paymentId],
    queryFn: () => api.get<SupportPayment>(`/support/payments/${paymentId}`),
    enabled: pending,
    refetchInterval: pending ? POLL_MS : false,
  })

  // Polling only ever moves a pending charge forward; a stale answer never
  // undoes what the simulate button (or a faster poll) already showed.
  useEffect(() => {
    if (poll.data && payment?.status === 'pending' && poll.data.status !== 'pending') {
      setPayment(poll.data)
    }
  }, [poll.data, payment?.status])

  // Once paid, the HUD and the profile learn about the badge right away.
  useEffect(() => {
    if (payment?.status !== 'approved') return
    void queryClient.invalidateQueries({ queryKey: ['support', 'me'] })
    if (user && !user.is_supporter) {
      updateUser({ ...user, is_supporter: true, supporter_since: payment.approved_at })
    }
  }, [payment, user, updateUser, queryClient])

  useEffect(() => {
    if (!pending) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [pending])

  const customCents = parseReais(custom)
  const chosen = custom ? customCents : amount
  const valid = chosen != null && chosen >= MIN_CENTS && chosen <= MAX_CENTS

  async function createCharge() {
    if (!valid || chosen == null) return
    setCreating(true)
    setError(null)
    try {
      const created = await api.post<SupportPayment>('/support/payments', { amount_cents: chosen })
      setPayment(created)
      setCopied(false)
      setNow(Date.now())
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 502
          ? caught.message
          : 'Não foi possível gerar o Pix agora. Tente de novo em instantes.'
      )
    } finally {
      setCreating(false)
    }
  }

  async function copyCode() {
    if (!payment) return
    try {
      await navigator.clipboard.writeText(payment.qr_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  async function simulate() {
    if (!payment) return
    const settled = await api.post<SupportPayment>(`/support/payments/${payment.id}/simulate`)
    setPayment(settled)
  }

  const supporterSince = summary.data?.supporter_since ?? user?.supporter_since ?? null
  const expired = payment?.status === 'expired'

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Apoie o Mavva</h1>
        <p className="text-sm font-semibold text-sand-500">
          O Mavva é gratuito e sem anúncios. Sua oferta mantém o servidor no ar e as novas perguntas
          chegando.
        </p>
      </header>

      {supporterSince && (
        <Card className="flex items-center gap-4 ring-2 ring-grain-300">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-grain-100 text-grain-700"
            aria-hidden
          >
            <Glyph as={AppIcons.heart} className="h-7 w-7" />
          </span>
          <div>
            <p className="font-extrabold text-ink">Você é Mavva Apoiador</p>
            <p className="text-sm font-semibold text-sand-500">
              Desde {formatDate(supporterSince)}
              {summary.data && summary.data.total_cents > 0
                ? ` · ${formatReais(summary.data.total_cents)} em ofertas`
                : ''}
            </p>
          </div>
        </Card>
      )}

      {summary.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : payment?.status === 'approved' ? (
        <Card className="text-center">
          <div role="status">
            <span
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-grain-400 text-grain-900 shadow-[0_4px_0_0_#aa5012]"
              aria-hidden
            >
              <Glyph as={AppIcons.heart} className="h-9 w-9" />
            </span>
            <h2 className="mt-4 text-xl font-extrabold text-ink">Oferta recebida!</h2>
            <p className="mt-1 text-sm font-semibold text-sand-600">
              {formatReais(payment.amount_cents)} · obrigado por manter o Mavva no ar. Você agora é
              Mavva Apoiador.
            </p>
            <Button className="mt-5" variant="secondary" onClick={() => setPayment(null)}>
              Ofertar de novo
            </Button>
          </div>
        </Card>
      ) : pending && payment ? (
        <Card>
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-extrabold uppercase tracking-wider text-sand-600">
              Pix de {formatReais(payment.amount_cents)}
            </p>
            <div className="rounded-2xl bg-white p-3 ring-2 ring-sand-200">
              <QRCodeSVG
                value={payment.qr_code}
                size={208}
                level="M"
                role="img"
                aria-label="QR Code do Pix"
              />
            </div>
            <p className="text-center text-sm font-semibold text-sand-500">
              Escaneie no app do seu banco ou copie o código abaixo. Expira em{' '}
              {minutesLeft(payment.expires_at, now)} min.
            </p>
            <label className="w-full">
              <span className="sr-only">Pix copia e cola</span>
              <textarea
                readOnly
                value={payment.qr_code}
                rows={3}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full resize-none rounded-2xl border-2 border-sand-200 bg-sand-50 p-3 font-mono text-xs text-ink"
              />
            </label>
            <Button full onClick={() => void copyCode()}>
              {copied ? 'Copiado!' : 'Copiar código Pix'}
            </Button>
            <p className="flex items-center gap-2 text-xs font-bold text-sand-500">
              <Spinner className="h-4 w-4" />
              Aguardando o pagamento…
            </p>
            {payment.provider === 'fake' && (
              <Button variant="gold" size="sm" onClick={() => void simulate()}>
                Simular pagamento (dev)
              </Button>
            )}
            <button
              type="button"
              onClick={() => setPayment(null)}
              className="text-xs font-extrabold uppercase tracking-wide text-sand-500 hover:text-ink"
            >
              Escolher outro valor
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          {expired && (
            <p className="mb-4 rounded-2xl bg-sand-100 px-4 py-3 text-sm font-semibold text-sand-600">
              Aquele Pix expirou. Gere um novo quando quiser.
            </p>
          )}
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-sand-600">
            Quanto você quer ofertar?
          </h2>
          <div role="radiogroup" aria-label="Valor" className="mt-3 grid grid-cols-4 gap-2">
            {PRESETS.map((cents) => {
              const selected = !custom && amount === cents
              return (
                <button
                  key={cents}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setAmount(cents)
                    setCustom('')
                  }}
                  className={`rounded-2xl border-b-4 px-2 py-3 text-sm font-extrabold transition-colors ${
                    selected
                      ? 'border-leaf-700 bg-leaf-500 text-white'
                      : 'border-sand-200 bg-white text-ink hover:bg-sand-50'
                  }`}
                >
                  {formatReais(cents)}
                </button>
              )
            })}
          </div>
          <label className="mt-3 block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-sand-500">
              Ou outro valor (R$)
            </span>
            <input
              inputMode="decimal"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="Ex.: 15"
              className="mt-1 w-full rounded-2xl border-2 border-sand-200 bg-white px-4 py-3 font-bold text-ink outline-none focus:border-leaf-400"
            />
          </label>
          {custom && !valid && (
            <p className="mt-2 text-xs font-bold text-red-600">
              Escolha um valor entre {formatReais(MIN_CENTS)} e {formatReais(MAX_CENTS)}.
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm font-bold text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button
            className="mt-5"
            full
            loading={creating}
            disabled={!valid}
            onClick={() => void createCharge()}
          >
            Gerar Pix{valid && chosen != null ? ` de ${formatReais(chosen)}` : ''}
          </Button>
          <p className="mt-3 text-center text-xs font-semibold text-sand-400">
            Pagamento processado pelo Mercado Pago. Apoiadores ganham um selo no perfil e, em breve,
            benefícios como criar ligas.
          </p>
        </Card>
      )}
    </div>
  )
}

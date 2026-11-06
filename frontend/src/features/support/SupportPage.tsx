import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { api, ApiError } from '@/lib/api'
import type { SupportPayment, SupportSummary, User } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { SupporterBadge } from '@/components/SupporterBadge'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate, formatReais } from '@/lib/format'
import { AppIcons, Glyph } from '@/lib/icons'

/** Offered amounts, in cents; the custom box takes anything in the API's range. */
const PRESETS = [500, 1000, 2000, 5000]
const MIN_CENTS = 500
const MAX_CENTS = 100_000
const POLL_MS = 5000
/** Mirrors the API: every R$ 30 (or part of it) keeps the badge 30 more days. */
const TIER_CENTS = 3000
const DAYS_PER_TIER = 30

function badgeDays(cents: number): number {
  return Math.ceil(cents / TIER_CENTS) * DAYS_PER_TIER
}

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

  // Once paid, the HUD and the profile learn about the badge (and its new end
  // date) right away.
  const celebratedId = useRef<string | null>(null)
  useEffect(() => {
    if (payment?.status !== 'approved' || celebratedId.current === payment.id) return
    celebratedId.current = payment.id
    void queryClient.invalidateQueries({ queryKey: ['support', 'me'] })
    void api
      .get<User>('/users/me')
      .then((me) => updateUser(me))
      .catch(() => {
        if (user) updateUser({ ...user, is_supporter: true })
      })
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
  const supporterUntil = summary.data?.supporter_until ?? user?.supporter_until ?? null
  const supporterActive = !!supporterUntil && new Date(supporterUntil).getTime() > now
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

      {supporterSince && supporterUntil && (
        <Card
          className={`flex items-center gap-4 ring-2 ${supporterActive ? 'ring-grain-300' : 'ring-sand-200'}`}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-grain-100 text-grain-700"
            aria-hidden
          >
            <Glyph as={AppIcons.heart} className="h-7 w-7" />
          </span>
          <div>
            <p className="flex items-center gap-2 font-extrabold text-ink">
              {supporterActive ? 'Você é Mavva Apoiador' : 'Seu selo de Apoiador venceu'}
              {supporterActive && <SupporterBadge />}
            </p>
            <p className="text-sm font-semibold text-sand-500">
              {supporterActive
                ? `Selo válido até ${formatDate(supporterUntil)}`
                : `Valeu até ${formatDate(supporterUntil)} · uma nova oferta renova`}
              {summary.data && summary.data.total_cents > 0
                ? ` · ${formatReais(summary.data.total_cents)} em ofertas desde ${formatDate(supporterSince)}`
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
              {formatReais(payment.amount_cents)} · obrigado por manter o Mavva no ar. Seu selo de
              Apoiador ganhou {payment.supporter_days} dias
              {user?.supporter_until ? `, até ${formatDate(user.supporter_until)}` : ''}.
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
                  <span
                    className={`mt-0.5 block text-[10px] font-bold ${selected ? 'text-white/80' : 'text-sand-500'}`}
                  >
                    +{badgeDays(cents)} dias
                  </span>
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
          {valid && chosen != null && (
            <p className="mt-2 text-center text-xs font-bold text-sand-500">
              Garante o selo de Apoiador por {badgeDays(chosen)} dias
              {supporterActive ? ', somados ao prazo atual' : ''}.
            </p>
          )}
        </Card>
      )}

      {!summary.isPending && <SupportPerks supporter={!!supporterSince} />}
    </div>
  )
}

const PERKS_NOW = [
  'Selo de Apoiador ao lado do seu elo, no topo e no perfil',
  'Barra de XP e painel dourados',
  'Cada R$ 30 de oferta mantém o selo por 30 dias, somando com o prazo que já tem',
] as const

const PERKS_SOON = [
  'Criar ligas só para convidados e disputar com a sua turma',
  'Adicionar as suas próprias perguntas à liga',
  'Mavva sem anúncios, para sempre',
] as const

/** What a donation unlocks today and what the support is paying for next. */
function SupportPerks({ supporter }: { supporter: boolean }) {
  return (
    <section
      aria-labelledby="support-perks"
      className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-leaf-800 via-leaf-600 to-leaf-700 p-5 text-white shadow-[0_8px_0_0_#184220] sm:p-6"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-soft-glow absolute -right-10 -top-12 h-44 w-44 rounded-full bg-grain-300/30 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/10 blur-xl" />
      </div>
      <div className="relative">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-grain-200">
          {supporter ? 'Seu apoio em ação' : 'O que o seu apoio destrava'}
        </p>
        <h2 id="support-perks" className="mt-1 text-xl font-extrabold leading-tight">
          Mavva Apoiador
        </h2>
        <ul className="mt-4 space-y-2">
          {PERKS_NOW.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm font-bold">
              <Glyph as={AppIcons.check} className="mt-0.5 h-5 w-5 shrink-0 text-grain-200" />
              {perk}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.18em] text-grain-200">
          Em breve, com o apoio de vocês
        </p>
        <ul className="mt-2 space-y-2">
          {PERKS_SOON.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm font-bold text-white/85">
              <Glyph as={AppIcons.sparkle} className="mt-0.5 h-5 w-5 shrink-0 text-grain-200" />
              {perk}
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-center gap-1.5 text-xs font-bold text-white/70">
          <Glyph as={AppIcons.lock} className="h-4 w-4" />
          Pagamento seguro, processado pelo Mercado Pago.
        </p>
      </div>
    </section>
  )
}

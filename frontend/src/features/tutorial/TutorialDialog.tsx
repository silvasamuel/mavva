import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { RankBadge } from '@/components/RankBadge'
import { AppIcons, Glyph, type Icon } from '@/lib/icons'
import { RANK_CODES } from '@/lib/ranks'

interface Step {
  eyebrow: string
  title: string
  body: string
  art: ReactNode
}

function IconTile({ icon, tone }: { icon: Icon; tone: 'leaf' | 'grain' }) {
  return (
    <span
      className={`flex h-16 w-16 items-center justify-center rounded-3xl ring-2 ${
        tone === 'leaf'
          ? 'bg-leaf-50 text-leaf-700 ring-leaf-100'
          : 'bg-grain-50 text-grain-700 ring-grain-100'
      }`}
    >
      <Glyph as={icon} className="h-9 w-9" />
    </span>
  )
}

function Mascot({ code, accent }: { code: 'semente' | 'broto'; accent: Icon }) {
  return (
    <span className="relative inline-flex">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-grain-50 ring-2 ring-grain-100">
        <RankBadge code={code} size="lg" />
      </span>
      <Glyph as={accent} className="absolute -right-2 -top-1 h-7 w-7 text-grain-500" />
    </span>
  )
}

function buildSteps(firstName: string | undefined, replay: boolean): Step[] {
  return [
    {
      eyebrow: 'Boas-vindas',
      title: firstName ? `Que bom ter você aqui, ${firstName}!` : 'Que bom ter você aqui!',
      body: 'O Mavva é o seu estudo bíblico diário: um pouco de maná a cada manhã, em quizzes rápidos. Veja em poucos passos como tudo funciona.',
      art: <Mascot code="semente" accent={AppIcons.sparkle} />,
    },
    {
      eyebrow: 'Maná do dia',
      title: 'Meta diária e sequência',
      body: 'Cada quiz rende XP para a meta diária, o maná do dia. Termine ao menos um quiz por dia para manter a sequência acesa: a chama no topo da tela conta os dias seguidos.',
      art: (
        <span className="flex items-center gap-3">
          <IconTile icon={AppIcons.manna} tone="grain" />
          <IconTile icon={AppIcons.streak} tone="grain" />
        </span>
      ),
    },
    {
      eyebrow: 'Estudar',
      title: 'Monte o estudo do seu jeito',
      body: 'Escolha testamento, categorias, dificuldade e quantas perguntas quer. Toda resposta vem com explicação e referência bíblica.',
      art: <IconTile icon={AppIcons.study} tone="leaf" />,
    },
    {
      eyebrow: 'Revisão inteligente',
      title: 'O que você aprende, fica',
      body: 'Em Revisar, as perguntas que você já respondeu voltam na hora certa: as que errou, logo; as que já domina, mais adiante.',
      art: <IconTile icon={AppIcons.review} tone="leaf" />,
    },
    {
      eyebrow: 'Duelos, elo e temporadas',
      title: 'Desafie, suba e cresça',
      body: 'Duele com um amigo (ou alguém aleatório) e veja seu elo crescer de Semente até Celeiro. Cada mês é uma temporada: no dia 1º, XP, nível e o ranking de XP recomeçam, e seu maior elo fica no perfil.',
      art: (
        // The whole ladder, Semente to Celeiro — 7 small badges fit a 360px phone.
        <span className="flex items-center gap-1">
          {RANK_CODES.map((code, index) => (
            <span key={code} style={{ opacity: 0.45 + (index / (RANK_CODES.length - 1)) * 0.55 }}>
              <RankBadge code={code} size="sm" />
            </span>
          ))}
        </span>
      ),
    },
    {
      eyebrow: 'Tudo pronto',
      title: 'Sua semente já está plantada',
      body: replay
        ? 'É só escolher por onde seguir. Um quiz rápido já rende maná para a meta de hoje.'
        : 'Que tal começar agora? Um quiz rápido já rende o primeiro maná do dia. Se quiser rever este guia, ele fica no seu Perfil.',
      art: <Mascot code="broto" accent={AppIcons.confetti} />,
    },
  ]
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function TutorialCard({
  onClose,
  firstName,
  replay,
}: {
  onClose: () => void
  firstName?: string
  replay: boolean
}) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const steps = buildSteps(firstName, replay)
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const closedRef = useRef(false)
  const bodyId = useId()
  const last = step === steps.length - 1
  const current = steps[step]

  function close() {
    // The card lingers during its exit animation: ignore a second Escape/click.
    if (closedRef.current) return
    closedRef.current = true
    const target = returnFocusRef.current
    if (target?.isConnected) target.focus()
    onClose()
  }

  function go(next: number) {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  // Focus moves into the dialog on open and back to where it was on close.
  // ??= keeps the first value when StrictMode runs this effect twice.
  useEffect(() => {
    returnFocusRef.current ??= document.activeElement as HTMLElement | null
    primaryRef.current?.focus()
  }, [])

  // "Voltar" vanishes on the first step and "Próximo" on the last: when the
  // focused button goes away, hand focus to the step's main action.
  useEffect(() => {
    if (!cardRef.current?.contains(document.activeElement)) primaryRef.current?.focus()
  }, [step])

  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !cardRef.current) return
      // Keep Tab inside the dialog: the page behind it is out of reach.
      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const lastItem = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = cardRef.current.contains(active)
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && (active === lastItem || !inside)) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    // Scrolls when the card is taller than the screen (a phone held sideways);
    // m-auto keeps it centered while it fits. Above the cookie banner (z-60),
    // which would cover the buttons on a phone; it's back once this closes.
    <div className="fixed inset-0 z-[70] flex overflow-y-auto overscroll-contain p-4">
      <motion.div
        aria-hidden
        className="fixed inset-0 bg-ink/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tutorial do Mavva"
        aria-describedby={bodyId}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18, ease: 'easeOut', opacity: { duration: 0.12 } }}
        className="relative m-auto w-full max-w-sm rounded-3xl bg-white p-5 shadow-card sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((item, index) => (
              <span
                key={item.eyebrow}
                className={`h-2 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                  index === step
                    ? 'w-6 bg-leaf-500'
                    : index < step
                      ? 'w-2 bg-leaf-300'
                      : 'w-2 bg-sand-200'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            className="-mr-2 min-h-10 rounded-xl px-3 text-sm font-extrabold text-sand-600 transition-colors hover:bg-sand-100 hover:text-ink"
          >
            Pular
          </button>
        </div>

        <div aria-live="polite">
          <motion.div
            key={step}
            // The first step rides in with the card; only step changes slide.
            initial={
              reduceMotion || (step === 0 && direction === 1)
                ? false
                : { opacity: 0, x: direction * 24 }
            }
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mt-3 text-center"
          >
            <p className="sr-only">
              Passo {step + 1} de {steps.length}
            </p>
            <div className="flex h-20 items-center justify-center sm:h-24">{current.art}</div>
            <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.18em] text-grain-700">
              {current.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-extrabold leading-tight text-ink">{current.title}</h2>
            <p id={bodyId} className="mt-2 text-sm font-semibold leading-relaxed text-sand-600">
              {current.body}
            </p>
          </motion.div>
        </div>

        {/* Keyed so React never turns the focused "Próximo" into another
            button in place; "Voltar" keeps its element (and focus) throughout. */}
        <div className="mt-5 flex flex-col gap-2">
          {last && (
            <Button
              key="quiz"
              ref={primaryRef}
              full
              onClick={() => {
                close()
                navigate('/quiz/new')
              }}
            >
              {replay ? 'Fazer um quiz' : 'Fazer meu primeiro quiz'}
            </Button>
          )}
          {last && (
            <Button key="explore" variant="secondary" full onClick={close}>
              Explorar o app
            </Button>
          )}
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                key="back"
                variant={last ? 'ghost' : 'secondary'}
                className="flex-1"
                onClick={() => go(step - 1)}
              >
                Voltar
              </Button>
            )}
            {!last && (
              <Button key="next" ref={primaryRef} className="flex-1" onClick={() => go(step + 1)}>
                Próximo
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/**
 * Step-by-step tour of the app. A centered dialog instead of tooltips pinned
 * to elements, which break on phones. `onClose` runs on every way out —
 * Pular, Escape, "Explorar o app" and the quiz CTA (which also navigates).
 */
export function TutorialDialog({
  open,
  onClose,
  firstName,
  replay = false,
}: {
  open: boolean
  onClose: () => void
  firstName?: string
  /** Opened again from the profile: copy that doesn't assume a first visit. */
  replay?: boolean
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <TutorialCard key="tutorial" onClose={onClose} firstName={firstName} replay={replay} />
      )}
    </AnimatePresence>,
    document.body
  )
}

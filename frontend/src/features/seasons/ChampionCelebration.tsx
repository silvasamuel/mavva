import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { api } from '@/lib/api'
import type { DashboardData } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { MonthTrophy } from '@/components/MonthTrophy'
import { trophyForSeason } from '@/lib/trophies'

const CONFETTI_COLORS = ['#F3CB57', '#57B663', '#FFFFFF', '#E8671A', '#8DD295', '#FFE79A']

// Fixed pseudo-random spread, so the burst looks the same on every render.
const CONFETTI = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 13) % 10) / 10,
  duration: 2.4 + ((i * 7) % 10) / 6,
  rotate: (i * 47) % 360,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  wide: i % 3 === 0,
}))

/**
 * The last season's champion, on their first visit after it closed: a trophy,
 * light rays and confetti, once. Dismissing (or opening the trophy) tells the
 * server, so it never comes back on another device either.
 */
export function ChampionCelebration() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })
  const celebration = data?.champion_celebration ?? null
  const primaryRef = useRef<HTMLButtonElement>(null)

  function close(then?: () => void) {
    queryClient.setQueryData<DashboardData>(['dashboard'], (current) =>
      current ? { ...current, champion_celebration: null } : current
    )
    void api.post('/users/me/champion-celebration').catch(() => {
      // Offline: it shows again next visit, which is harmless.
    })
    then?.()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  const showing = celebration?.season.number
  useEffect(() => {
    if (showing == null) return
    primaryRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showing])

  return createPortal(
    <AnimatePresence>
      {celebration && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Campeão da temporada de ${celebration.season.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-leaf-900/95 p-6 text-center text-white"
        >
          {!reduceMotion && (
            <>
              {/* slow-turning light rays behind the trophy */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 opacity-25"
                style={{
                  background:
                    'repeating-conic-gradient(from 0deg, #F3CB57 0deg 8deg, transparent 8deg 24deg)',
                  maskImage: 'radial-gradient(circle, black 0%, transparent 60%)',
                  WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 60%)',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 40, ease: 'linear', repeat: Infinity }}
              />
              {CONFETTI.map((piece, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className={`pointer-events-none absolute top-0 block rounded-sm ${piece.wide ? 'h-2 w-4' : 'h-3 w-2'}`}
                  style={{ left: `${piece.left}%`, backgroundColor: piece.color }}
                  initial={{ y: '-10vh', rotate: piece.rotate, opacity: 1 }}
                  animate={{ y: '110vh', rotate: piece.rotate + 540 }}
                  transition={{
                    duration: piece.duration,
                    delay: piece.delay,
                    ease: 'easeIn',
                    repeat: Infinity,
                    repeatDelay: 0.6,
                  }}
                />
              ))}
            </>
          )}

          <div className="relative flex max-w-sm flex-col items-center gap-3">
            <motion.div
              initial={reduceMotion ? false : { scale: 0.2, rotate: -20, y: 40 }}
              animate={{ scale: 1, rotate: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }}
              className="flex h-36 w-36 items-center justify-center rounded-full bg-grain-400 text-grain-900 shadow-[0_0_80px_20px_rgba(243,203,87,0.45)] ring-8 ring-grain-300/60"
            >
              <MonthTrophy season={celebration.season.name} className="h-28 w-24" />
            </motion.div>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="space-y-2"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-grain-200">
                Campeão da temporada
              </p>
              <h2 className="text-3xl font-extrabold leading-tight">{celebration.season.name}</h2>
              <p className="text-sm font-semibold text-white/80">
                Você terminou em 1º lugar com{' '}
                <strong className="font-extrabold text-grain-200">
                  {celebration.final_xp.toLocaleString('pt-BR')} XP
                </strong>
                . Seu troféu de {trophyForSeason(celebration.season.name).stone.toLowerCase()} já está no perfil.
              </p>
            </motion.div>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-3 flex w-full flex-col gap-2"
            >
              <Button ref={primaryRef} variant="gold" full onClick={() => close(() => navigate('/profile'))}>
                Ver meu troféu
              </Button>
              <button
                type="button"
                onClick={() => close()}
                className="py-2 text-sm font-extrabold text-white/80 hover:text-white"
              >
                Continuar
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Button } from '@/components/ui/Button'
import { readTrackingChoice, writeTrackingChoice, type TrackingChoice } from '@/lib/trackingConsent'

export function TrackingConsent() {
  const { pathname } = useLocation()
  const [choice, setChoice] = useState<TrackingChoice | null>(null)
  const playing = /^\/quiz\/[^/]+/.test(pathname)

  useEffect(() => {
    setChoice(readTrackingChoice())
  }, [])

  function decide(next: TrackingChoice) {
    writeTrackingChoice(next)
    setChoice(next)
  }

  return (
    <>
      {choice === 'accepted' && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
      {choice === null && !playing && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-sand-200/80 bg-[#f4efe0]/95 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs font-semibold leading-relaxed text-sand-700">
              Usamos um cookie essencial para manter o login. Métricas da Vercel (Analytics e Speed
              Insights) só rodam se você aceitar.{' '}
              <Link to="/privacidade" className="font-extrabold text-leaf-700 underline">
                Política de Privacidade
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => decide('essential')}>
                Só o essencial
              </Button>
              <Button size="sm" onClick={() => decide('accepted')}>
                Aceitar métricas
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { lazy, Suspense, useEffect, useState } from 'react'
import sementePng from '@/assets/mascot/semente.png'

const SeedMascotCanvas = lazy(() => import('./SeedMascotCanvas'))

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Mavva's seed. Paints a still frame at once and swaps in the animated one
 * once the page is idle and the runtime has loaded, so the first paint never
 * waits on it. With reduced motion it stays still and the runtime never loads.
 */
export function SeedMascot({ className = '' }: { className?: string }) {
  const [animate, setAnimate] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion()) return
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setAnimate(true), { timeout: 1500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(() => setAnimate(true), 300)
    return () => clearTimeout(id)
  }, [])

  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden>
      <img
        src={sementePng}
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-contain object-bottom ${ready ? 'invisible' : ''}`}
      />
      {animate && (
        <Suspense fallback={null}>
          <SeedMascotCanvas
            className={`absolute inset-0 h-full w-full ${ready ? '' : 'invisible'}`}
            onReady={() => setReady(true)}
          />
        </Suspense>
      )}
    </span>
  )
}

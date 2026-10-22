import { useEffect } from 'react'
import {
  Alignment,
  Fit,
  Layout,
  RuntimeLoader,
  useRive,
  useStateMachineInput,
} from '@rive-app/react-canvas'
// Self-hosted runtime: by default Rive fetches its wasm from unpkg on every visit.
import riveWasm from '@rive-app/canvas/rive.wasm?url'
import semente from '@/assets/mascot/semente.riv?url'

RuntimeLoader.setWasmUrl(riveWasm)

const MACHINE = 'Mascot'
// Distance (px) from the eyes at which the gaze reaches its limit on each axis.
const REACH_X = 320
const REACH_Y = 240
// The eyes sit halfway down the framed seed.
const EYES_AT = 0.5

function reach(delta: number, limit: number): number {
  return Math.max(-1, Math.min(1, delta / limit))
}

/**
 * The animated seed (frontend/rive/semente). Kept in its own module so the
 * runtime (~600 KB compressed) only loads when a mascot is actually shown.
 * Its "Mascot" state machine idles on its own; with `followPointer` the eyes
 * track the pointer anywhere on the page (lookX/lookY, 0-100, 50 = ahead).
 */
export default function SeedMascotCanvas({
  className,
  followPointer = true,
  onReady,
}: {
  className?: string
  followPointer?: boolean
  onReady?: () => void
}) {
  const { rive, canvas, RiveComponent } = useRive({
    src: semente,
    stateMachines: MACHINE,
    autoplay: true,
    // The artboard leaves room above the sprout for jumps; frame just the seed.
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.BottomCenter,
      minX: 60,
      minY: 118,
      maxX: 340,
      maxY: 468,
    }),
    onLoad: () => onReady?.(),
  })
  const lookX = useStateMachineInput(rive, MACHINE, 'lookX', 50)
  const lookY = useStateMachineInput(rive, MACHINE, 'lookY', 50)

  useEffect(() => {
    if (!followPointer || !lookX || !lookY || !canvas) return
    const target = { x: 50, y: 50 }
    const current = { x: 50, y: 50 }
    let frame = 0

    // Ease toward the pointer instead of snapping, one small step per frame.
    function step() {
      current.x += (target.x - current.x) * 0.22
      current.y += (target.y - current.y) * 0.22
      lookX!.value = current.x
      lookY!.value = current.y
      const settled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) < 0.1
      frame = settled ? 0 : requestAnimationFrame(step)
    }

    function onMove(event: PointerEvent) {
      const box = canvas!.getBoundingClientRect()
      const eyesX = box.left + box.width / 2
      const eyesY = box.top + box.height * EYES_AT
      target.x = 50 + 50 * reach(event.clientX - eyesX, REACH_X)
      target.y = 50 + 50 * reach(event.clientY - eyesY, REACH_Y)
      if (!frame) frame = requestAnimationFrame(step)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [followPointer, lookX, lookY, canvas])

  return <RiveComponent className={className} aria-hidden />
}

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppIcons, Glyph } from '@/lib/icons'

const GAP = 8
const MARGIN = 12

/**
 * A small "i" button that explains something without cluttering the screen
 * (the "toggletip" pattern). Mouse: shows on hover. Touch: tap toggles.
 * Keyboard: Enter/Space toggles, Esc closes, tabbing away closes. Focus alone
 * never opens it — guessing keyboard-vs-pointer focus via :focus-visible is
 * unreliable across engines.
 *
 * The bubble is portaled to <body> with fixed positioning and clamped to the
 * viewport: Cards use backdrop-blur, which makes them the containing block for
 * fixed children, so an in-place bubble would be positioned (and clipped)
 * relative to the card instead of the screen.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const lastPointer = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const button = buttonRef.current
    const bubble = bubbleRef.current
    if (!button || !bubble) return
    const anchor = button.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = bubble
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - width / 2, MARGIN),
      window.innerWidth - width - MARGIN
    )
    const below = anchor.bottom + GAP
    const top = below + height > window.innerHeight - MARGIN ? anchor.top - GAP - height : below
    setPos({ top: Math.max(top, MARGIN), left: Math.max(left, MARGIN) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !bubbleRef.current?.contains(target)) close()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    // A fixed bubble goes stale when the page moves under it.
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setOpen(true)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setOpen(false)
        }}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          // Hover already opened it for a mouse; a click shouldn't snap it shut.
          // detail === 0 means Enter/Space, which should toggle.
          if (event.detail !== 0 && lastPointer.current === 'mouse') return
          setOpen((current) => !current)
        }}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sand-400 transition-colors hover:text-leaf-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf-500"
      >
        <Glyph as={AppIcons.info} className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            style={
              pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }
            }
            className="fixed z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-ink px-4 py-3 text-left text-xs font-semibold normal-case leading-relaxed tracking-normal text-white shadow-card-hover"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

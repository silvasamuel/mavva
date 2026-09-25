import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

export function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        // Scrolls when the card is taller than the screen (short phones, the
        // keyboard open); m-auto keeps it centered while it fits.
        <div
          className="fixed inset-0 z-50 flex overflow-y-auto p-4"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={onClose}
        >
          {/* The backdrop fades on its own. When the card sat inside the fading
              layer, both stayed see-through for ~300ms and the page showed
              through the card — on a phone, where the card fills the screen,
              that looked like the screen flickering. */}
          <motion.div
            aria-hidden
            className="fixed inset-0 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16, ease: 'easeOut', opacity: { duration: 0.1 } }}
            onClick={(event) => event.stopPropagation()}
            className="relative m-auto w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-card"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

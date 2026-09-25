import { motion } from 'framer-motion'

export function ProgressBar({
  value,
  max,
  color = 'bg-leaf-500',
  className = '',
}: {
  value: number
  max: number
  color?: string
  className?: string
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  // h-4 is only the fallback: with two h-* classes, whichever Tailwind emits
  // last wins, so a caller's h-2 used to lose to it.
  const height = /(^|\s)h-/.test(className) ? '' : 'h-4'
  return (
    <div
      className={`${height} overflow-hidden rounded-full bg-sand-100 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={false}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
    </div>
  )
}

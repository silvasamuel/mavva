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
  return (
    <div
      className={`h-4 overflow-hidden rounded-full bg-sand-100 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={false}
        animate={{ width: `${percent}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      />
    </div>
  )
}

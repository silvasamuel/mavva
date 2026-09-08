import { motion } from 'framer-motion'

export function ProgressRing({
  value,
  max,
  size = 96,
  stroke = 10,
  trackClass = 'stroke-sand-100',
  barClass,
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  trackClass?: string
  barClass?: string
  children?: React.ReactNode
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  const bar = barClass ?? (ratio >= 1 ? 'stroke-grain-400' : 'stroke-leaf-500')

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={trackClass}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={bar}
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

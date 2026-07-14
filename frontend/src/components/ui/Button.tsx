import { forwardRef } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-press bg-leaf-500 border-leaf-700 text-white hover:bg-leaf-600',
  gold: 'btn-press bg-grain-400 border-grain-600 text-grain-900 hover:bg-grain-300',
  secondary:
    'btn-press bg-white border-sand-200 text-ink shadow-card hover:bg-sand-50 border-x border-t border-x-sand-200 border-t-sand-200',
  ghost: 'text-leaf-600 hover:bg-leaf-50 border-b-4 border-transparent',
  danger: 'btn-press bg-red-500 border-red-700 text-white hover:bg-red-600',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  full?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, full = false, className = '', children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
})

import { forwardRef, useId } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', id, ...rest },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-bold text-sand-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        // 16px on touchscreens: iOS zooms into any field under 16px on focus
        // and stays zoomed. Mouse users keep the compact 14px.
        className={`w-full rounded-2xl border-2 bg-white px-4 py-3 text-base font-semibold placeholder:font-normal placeholder:text-sand-400 focus:border-leaf-500 focus-visible:ring-0 [@media(pointer:fine)]:text-sm ${
          error ? 'border-red-400' : 'border-sand-200'
        } ${className}`}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
})

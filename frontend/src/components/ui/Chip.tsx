/** A toggle pill for picking one or several options out of a short list. */
export function Chip({
  selected,
  onClick,
  children,
  disabled = false,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-extrabold transition-colors disabled:opacity-50 ${
        selected
          ? 'bg-leaf-500 text-white shadow-card'
          : 'bg-white text-sand-600 shadow-card hover:bg-sand-50'
      }`}
    >
      {children}
    </button>
  )
}

export function Card({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={`rounded-3xl bg-white/80 p-5 shadow-card backdrop-blur-sm ${className}`}>{children}</div>
}

const TITLE = 'text-sm font-extrabold uppercase tracking-wider text-sand-600'

export function CardTitle({
  children,
  aside,
}: {
  children: React.ReactNode
  /** Rendered right after the title, on its baseline — e.g. an InfoTip. */
  aside?: React.ReactNode
}) {
  if (aside == null) return <h2 className={`mb-3 ${TITLE}`}>{children}</h2>
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <h2 className={TITLE}>{children}</h2>
      {aside}
    </div>
  )
}

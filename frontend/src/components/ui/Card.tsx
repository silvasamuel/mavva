export function Card({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={`rounded-3xl bg-white/80 p-5 shadow-card backdrop-blur-sm ${className}`}>{children}</div>
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-sand-600">{children}</h2>
}

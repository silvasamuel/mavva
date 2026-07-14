export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <p className="font-extrabold text-sand-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-sand-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

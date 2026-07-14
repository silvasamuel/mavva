export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-8 w-8 text-lg', md: 'h-10 w-10 text-xl', lg: 'h-14 w-14 text-3xl' }[size]
  const text = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' }[size]
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex items-center justify-center rounded-2xl bg-leaf-500 ${dims}`}
        aria-hidden
      >
        <svg viewBox="0 0 64 64" className="h-3/4 w-3/4">
          <circle cx="24" cy="26" r="7" fill="#fefaec" />
          <circle cx="40" cy="24" r="5.5" fill="#f7e191" />
          <circle cx="33" cy="38" r="8.5" fill="#fbf1ca" />
          <circle cx="20" cy="42" r="4.5" fill="#f3cb57" opacity="0.9" />
          <circle cx="45" cy="40" r="5" fill="#fefaec" opacity="0.95" />
        </svg>
      </span>
      <span className={`font-extrabold tracking-tight text-ink ${text}`}>mavva</span>
    </div>
  )
}

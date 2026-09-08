export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-16 w-16' }[size]
  const text = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' }[size]
  return (
    <div className="flex items-center gap-2">
      <img src="/manna.svg?v=6" alt="" className={dims} aria-hidden />
      <span className={`font-extrabold lowercase tracking-tight text-leaf-600 ${text}`}>
        mavva
      </span>
    </div>
  )
}

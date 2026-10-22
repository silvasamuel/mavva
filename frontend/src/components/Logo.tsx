import { SeedMascot } from '@/components/mascot/SeedMascot'

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  // The seed is a little taller than wide (4:5), sprout included.
  const dims = { sm: 'h-14 w-11', md: 'h-24 w-[4.8rem]', lg: 'h-28 w-[5.6rem]' }[size]
  const text = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' }[size]
  // The name stands under the seed (sidebar, landing, login); only `sm` sits inline.
  const stacked = size !== 'sm'
  return (
    <div className={stacked ? 'flex flex-col items-center gap-1' : 'flex items-center gap-2'}>
      <SeedMascot className={dims} />
      <span className={`font-extrabold lowercase tracking-tight text-leaf-600 ${text}`}>
        mavva
      </span>
    </div>
  )
}

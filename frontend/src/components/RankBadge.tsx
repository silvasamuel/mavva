import { isRankCode, type RankCode } from '@/lib/ranks'

const SIZE = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
} as const

const PALETTE: Record<RankCode, { body: string; shadow: string; belly: string }> = {
  semente: { body: '#f3cb57', shadow: '#e89617', belly: '#fefaec' },
  broto: { body: '#57b663', shadow: '#329a40', belly: '#8dd295' },
  espiga: { body: '#57b663', shadow: '#329a40', belly: '#8dd295' },
  videira: { body: '#329a40', shadow: '#1e6329', belly: '#8dd295' },
  oliveira: { body: '#237d31', shadow: '#184220', belly: '#57b663' },
  cedro: { body: '#1e6329', shadow: '#184220', belly: '#329a40' },
  celeiro: { body: '#efb62f', shadow: '#cd7211', belly: '#fbf1ca' },
}

function SeedBody({ body, shadow, belly }: { body: string; shadow: string; belly: string }) {
  return (
    <>
      <path
        d="M32 12.5C44.8 20.2 53 33.6 53 44.8 53 54.6 43.8 61.5 32 61.5S11 54.6 11 44.8C11 33.6 19.2 20.2 32 12.5Z"
        fill={body}
      />
      <path
        d="M32 61.5c9.2 0 16.6-5 18.8-12.4-3.2 5.2-9.4 8.6-18.8 8.6-8.6 0-14.8-3.2-18.2-8.2C16.2 56.4 23.4 61.5 32 61.5Z"
        fill={shadow}
      />
      <ellipse cx="32" cy="48.5" rx="11" ry="8.2" fill={belly} />
    </>
  )
}

function Eyes() {
  return (
    <>
      <circle cx="24.4" cy="36.6" r="8.1" fill="#fefaec" />
      <circle cx="39.6" cy="36.6" r="8.1" fill="#fefaec" />
      <circle cx="25.1" cy="37.3" r="4.35" fill="#2b3229" />
      <circle cx="40.3" cy="37.3" r="4.35" fill="#2b3229" />
      <circle cx="23.2" cy="35.2" r="1.55" fill="#fff" />
      <circle cx="38.4" cy="35.2" r="1.55" fill="#fff" />
    </>
  )
}

function Crown({ code }: { code: RankCode }) {
  switch (code) {
    case 'semente':
      return null
    case 'broto':
      return (
        <>
          <rect x="30.4" y="4" width="3.2" height="9" rx="1.6" fill="#237d31" />
          <ellipse cx="25.6" cy="7.6" rx="7.2" ry="4.2" transform="rotate(-28 25.6 7.6)" fill="#8dd295" />
          <ellipse cx="38.6" cy="7.2" rx="6.6" ry="3.8" transform="rotate(32 38.6 7.2)" fill="#bce6c0" />
        </>
      )
    case 'espiga':
      return (
        <>
          <rect x="30.6" y="2" width="2.8" height="12" rx="1.4" fill="#237d31" />
          <circle cx="32" cy="4.2" r="3.1" fill="#f3cb57" />
          <circle cx="32" cy="9.2" r="3.4" fill="#efb62f" />
          <circle cx="32" cy="14.2" r="3.1" fill="#e89617" />
        </>
      )
    case 'videira':
      return (
        <>
          <path d="M31.2 14c1-6 7.2-9.6 12.4-9.2 1.2.1 1.2 1.8 0 2-4.4-.2-8.6 2.4-9.4 7.2-.1.8-1.3.8-1.3 0Z" fill="#184220" />
          <circle cx="41.5" cy="6.2" r="3.1" fill="#1c4f25" />
          <circle cx="45.8" cy="9.4" r="2.7" fill="#184220" />
          <circle cx="40.2" cy="10.6" r="2.5" fill="#237d31" />
        </>
      )
    case 'oliveira':
      return (
        <>
          <ellipse cx="22.5" cy="9" rx="9" ry="5" transform="rotate(-32 22.5 9)" fill="#57b663" />
          <ellipse cx="41.5" cy="8.6" rx="8.4" ry="4.6" transform="rotate(30 41.5 8.6)" fill="#8dd295" />
          <ellipse cx="20.5" cy="12.8" rx="2.4" ry="3.2" transform="rotate(-18 20.5 12.8)" fill="#f3cb57" />
          <ellipse cx="43.8" cy="12.4" rx="2.3" ry="3" transform="rotate(16 43.8 12.4)" fill="#efb62f" />
        </>
      )
    case 'cedro':
      return (
        <>
          <path d="M32 1.2 39 10.8H25Z" fill="#57b663" />
          <path d="M32 5.5 41.5 16H22.5Z" fill="#329a40" />
          <path d="M32 10 44 22H20Z" fill="#237d31" />
        </>
      )
    case 'celeiro':
      return (
        <>
          <path d="M18 15.5 32 4.5 46 15.5H18Z" fill="#f3cb57" />
          <path d="M20 15.5h24v4.5H20Z" fill="#e89617" />
        </>
      )
  }
}

function Mark({ code }: { code: RankCode }) {
  const palette = PALETTE[code]
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <Crown code={code} />
      <SeedBody {...palette} />
      <Eyes />
    </svg>
  )
}

export function RankBadge({
  code,
  name,
  size = 'md',
  showName = false,
}: {
  code: string
  name?: string
  size?: keyof typeof SIZE
  showName?: boolean
}) {
  const resolved: RankCode = isRankCode(code) ? code : 'semente'
  return (
    <span className={showName ? 'inline-flex items-center gap-2' : 'inline-flex'}>
      <span className={`inline-flex shrink-0 ${SIZE[size]}`} aria-hidden>
        <Mark code={resolved} />
      </span>
      {showName && name && <span className="font-extrabold">{name}</span>}
    </span>
  )
}

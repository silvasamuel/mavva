import { isRankCode, type RankCode } from '@/lib/ranks'

const DISC: Record<RankCode, string> = {
  semente: 'bg-sand-400',
  broto: 'bg-leaf-300',
  espiga: 'bg-leaf-400',
  videira: 'bg-leaf-500',
  oliveira: 'bg-leaf-700',
  cedro: 'bg-leaf-800',
  celeiro: 'bg-grain-500',
}

const SIZE = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
} as const

const GLYPH = '#fefaec'

function Mark({ code }: { code: RankCode }) {
  switch (code) {
    case 'semente':
      return (
        <path
          fill={GLYPH}
          fillRule="evenodd"
          d="M12 3.4c4.4 3.8 5.8 8.8 0 17.2C6.2 12.2 7.6 7.2 12 3.4Zm0 4.6c-.3 2.2-.3 5.2 0 7.8.3-2.6.3-5.6 0-7.8Z"
        />
      )
    case 'broto':
      return (
        <>
          <ellipse cx="12" cy="19.1" rx="3.1" ry="2.2" fill={GLYPH} />
          <rect x="11.15" y="9.2" width="1.7" height="9.6" rx="0.85" fill={GLYPH} />
          <path
            fill={GLYPH}
            d="M11.7 11.8C8.2 9.4 6.2 7.4 7.6 5.8c2.4 1.1 4.1 3.4 4.1 6z"
          />
          <path
            fill={GLYPH}
            d="M12.3 11.8C15.8 9.4 17.8 7.4 16.4 5.8c-2.4 1.1-4.1 3.4-4.1 6z"
          />
        </>
      )
    case 'espiga':
      return (
        <>
          <circle cx="12" cy="5.3" r="2.15" fill={GLYPH} />
          <circle cx="12" cy="9.8" r="2.35" fill={GLYPH} />
          <circle cx="12" cy="14.5" r="2.55" fill={GLYPH} />
          <rect x="11.15" y="16" width="1.7" height="5.2" rx="0.85" fill={GLYPH} />
        </>
      )
    case 'videira':
      return (
        <>
          <circle cx="12" cy="7.1" r="2.35" fill={GLYPH} />
          <circle cx="8.3" cy="10.8" r="2.25" fill={GLYPH} />
          <circle cx="15.7" cy="10.8" r="2.25" fill={GLYPH} />
          <circle cx="9.7" cy="15.3" r="2.15" fill={GLYPH} />
          <circle cx="14.3" cy="15.3" r="2.15" fill={GLYPH} />
          <path
            fill={GLYPH}
            d="M16.2 4.1c2.1.3 3.6 1.8 3 3.5-1.7-.3-3.1-1.5-3.6-3.1-.2-.5.2-.5.6-.4Z"
          />
        </>
      )
    case 'oliveira':
      return (
        <>
          <ellipse cx="12" cy="10.2" rx="7.4" ry="6.4" fill={GLYPH} />
          <rect x="11.1" y="14.4" width="1.8" height="6.8" rx="0.9" fill={GLYPH} />
          <ellipse cx="8.4" cy="17.4" rx="1.35" ry="1.7" fill={GLYPH} />
          <ellipse cx="15.6" cy="17.1" rx="1.25" ry="1.6" fill={GLYPH} />
        </>
      )
    case 'cedro':
      return (
        <>
          <path fill={GLYPH} d="M12 2.6 17.1 9.2H6.9Z" />
          <path fill={GLYPH} d="M12 7 18.4 14.4H5.6Z" />
          <path fill={GLYPH} d="M12 12 19.5 21.2H4.5Z" />
        </>
      )
    case 'celeiro':
      return (
        <path
          fill={GLYPH}
          fillRule="evenodd"
          d="M4.3 11.1 12 4.5l7.7 6.6V20.6H4.3V11.1Zm7.7 2.4c1.4 0 2.3.8 2.3 2.1v4.8H9.7V15.6c0-1.3.9-2.1 2.3-2.1Z"
        />
      )
  }
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
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-2xl ${DISC[resolved]} ${SIZE[size]}`}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]">
          <Mark code={resolved} />
        </svg>
      </span>
      {showName && name && <span className="font-extrabold">{name}</span>}
    </span>
  )
}

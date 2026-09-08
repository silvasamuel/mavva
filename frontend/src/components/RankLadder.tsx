import { RankBadge } from '@/components/RankBadge'
import { RANK_CODES, RANK_NAMES, rankFromLevel, rankLadderIndex } from '@/lib/ranks'

export function RankLadder({ currentCode }: { currentCode: string }) {
  const current = rankLadderIndex(currentCode)
  return (
    <section className="rounded-3xl bg-white/75 px-4 py-4 shadow-card backdrop-blur-sm sm:px-5">
      <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-sand-600">
        Elo
      </h2>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {RANK_CODES.map((code, index) => {
          const rank = rankFromLevel(index * 5 + 1)
          const state = index < current ? 'done' : index === current ? 'now' : 'locked'
          return (
            <li key={code} className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1.5">
              <div
                className={`rounded-2xl p-1 ${
                  state === 'now'
                    ? 'bg-grain-100 ring-2 ring-grain-300'
                    : state === 'locked'
                      ? 'opacity-35 grayscale'
                      : ''
                }`}
                title={`${RANK_NAMES[code]} · nível ${rank.minLevel}${rank.maxLevel ? `–${rank.maxLevel}` : '+'}`}
              >
                <RankBadge code={code} size="md" />
              </div>
              <span
                className={`text-xs font-extrabold ${
                  state === 'now' ? 'text-grain-800' : 'text-sand-600'
                }`}
              >
                {RANK_NAMES[code]}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

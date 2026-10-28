import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { PlayerProfile, PublicUser } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SeasonTrophies } from '@/components/SeasonTrophies'
import { EloTile } from '@/components/EloTile'
import { RankBadge } from '@/components/RankBadge'
import { formatPercent } from '@/lib/format'
import { AchievementGlyph, AppIcons, CategoryGlyph, Glyph, type Icon } from '@/lib/icons'

const RELATION_LABEL: Partial<Record<PlayerProfile['relation'], string>> = {
  self: 'Você',
  friends: 'Amigo',
  pending_sent: 'Pedido enviado',
  pending_received: 'Quer ser seu amigo',
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function memberSince(value: string): string {
  const [year, month] = value.split('-').map(Number)
  return `${MONTHS[month - 1]} de ${year}`
}

function Stat({
  icon,
  value,
  label,
  hint,
}: {
  icon: Icon
  value: ReactNode
  label: string
  hint?: string
}) {
  return (
    // <dt> must come before <dd> inside a <dl> group; `order` puts the value on top.
    <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-sand-50 px-2 py-3">
      <span className="order-1">
        <Glyph as={icon} className="h-5 w-5 text-grain-600" />
      </span>
      <dt className="order-3 text-xs font-extrabold uppercase tracking-wide text-sand-500">
        {label}
      </dt>
      <dd className="order-2 text-lg font-extrabold leading-tight text-ink">{value}</dd>
      {hint && <dd className="order-4 text-xs font-semibold text-sand-400">{hint}</dd>}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sand-500">
      {children}
    </h3>
  )
}

const TABS = [
  { key: 'trophies', label: 'Troféus' },
  { key: 'achievements', label: 'Conquistas' },
  { key: 'stats', label: 'Estatísticas' },
] as const

type TabKey = (typeof TABS)[number]['key']

const METAL_COUNT: [position: number, one: string, many: string][] = [
  [1, 'ouro', 'ouros'],
  [2, 'prata', 'pratas'],
  [3, 'bronze', 'bronzes'],
]

/** "2 ouros · 1 bronze": a quick tally above a shelf that can grow long. */
function trophyTally(trophies: PlayerProfile['trophies']): string {
  return METAL_COUNT.map(([position, one, many]) => {
    const count = trophies.filter((t) => t.position === position).length
    return count === 0 ? null : `${count} ${count === 1 ? one : many}`
  })
    .filter(Boolean)
    .join(' · ')
}

/**
 * Trophies, achievements and stats, one at a time, so a long trophy shelf
 * doesn't push everything else out of sight. Arrow keys move between tabs.
 */
function ProfileTabs({ profile }: { profile: PlayerProfile }) {
  const [active, setActive] = useState<TabKey>('trophies')
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({})
  const id = useId()
  const counts: Partial<Record<TabKey, number>> = {
    trophies: profile.trophies.length,
    achievements: profile.achievements_unlocked,
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.key === active)
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : null
    if (next == null) return
    event.preventDefault()
    setActive(TABS[next].key)
    tabRefs.current[TABS[next].key]?.focus()
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Seções do perfil"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-2xl bg-sand-100 p-1"
      >
        {TABS.map((tab) => {
          const selected = tab.key === active
          const count = counts[tab.key]
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el
              }}
              type="button"
              role="tab"
              id={`${id}-${tab.key}-tab`}
              aria-selected={selected}
              aria-controls={`${id}-${tab.key}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.key)}
              className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500 ${
                selected ? 'bg-white text-ink shadow-sm' : 'text-sand-500 hover:text-ink'
              }`}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span
                  aria-hidden
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    selected ? 'bg-grain-100 text-grain-800' : 'bg-sand-200 text-sand-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-${active}-panel`}
        aria-labelledby={`${id}-${active}-tab`}
        tabIndex={0}
        className="mt-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500"
      >
        {active === 'trophies' && <TrophiesPanel trophies={profile.trophies} />}
        {active === 'achievements' && <AchievementsPanel profile={profile} />}
        {active === 'stats' && <StatsPanel profile={profile} />}
      </div>
    </div>
  )
}

function TrophiesPanel({ trophies }: { trophies: PlayerProfile['trophies'] }) {
  if (trophies.length === 0) {
    return (
      <p className="py-4 text-sm font-semibold text-sand-400">
        Nenhum troféu ainda. O pódio de cada temporada leva ouro, prata ou bronze.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-extrabold text-sand-500">{trophyTally(trophies)}</p>
      <SeasonTrophies trophies={trophies} />
    </div>
  )
}

function AchievementsPanel({ profile }: { profile: PlayerProfile }) {
  return (
    <section>
      <SectionTitle>
        Conquistas · {profile.achievements_unlocked} de {profile.achievements_total}
      </SectionTitle>
      {profile.achievements.length > 0 ? (
        <ul aria-label="Conquistas desbloqueadas" className="grid grid-cols-2 gap-2 text-left">
          {profile.achievements.map((achievement) => (
            <li
              key={achievement.code}
              className="flex items-center gap-2 rounded-2xl bg-grain-50 px-2.5 py-2 ring-1 ring-grain-200"
            >
              <span className="shrink-0 text-grain-700">
                <AchievementGlyph code={achievement.code} className="h-5 w-5" />
              </span>
              <span className="truncate text-xs font-bold text-ink">{achievement.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-sand-400">Nenhuma ainda.</p>
      )}
    </section>
  )
}

function StatsPanel({ profile }: { profile: PlayerProfile }) {
  const { user, stats } = profile
  const duels = user.duel_wins + user.duel_losses + user.duel_draws
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2">
        <Stat
          icon={stats.current_streak > 0 ? AppIcons.streak : AppIcons.streakOff}
          value={stats.current_streak === 1 ? '1 dia' : `${stats.current_streak} dias`}
          label="Sequência"
          hint={`recorde ${stats.longest_streak}`}
        />
        <Stat
          icon={AppIcons.check}
          value={formatPercent(stats.accuracy)}
          label="Precisão"
          hint={`${stats.questions_answered.toLocaleString('pt-BR')} respondidas`}
        />
        <Stat icon={AppIcons.star} value={stats.perfect_sessions} label="Sessões perfeitas" />
        <Stat
          icon={AppIcons.duels}
          value={`${user.duel_wins}V ${user.duel_draws}E ${user.duel_losses}D`}
          label="Duelos"
          hint={duels > 0 ? `${formatPercent(user.duel_wins / duels)} de vitórias` : 'nenhum ainda'}
        />
      </dl>

      {profile.strongest_categories.length > 0 && (
        <section>
          <SectionTitle>Mais forte em</SectionTitle>
          <ul className="space-y-1.5 text-left">
            {profile.strongest_categories.map((category) => (
              <li
                key={category.slug}
                className="flex items-center gap-2 rounded-2xl bg-sand-50 px-3 py-2"
              >
                <span className="shrink-0 text-leaf-700">
                  <CategoryGlyph slug={category.slug} emoji={category.icon} className="h-5 w-5" />
                </span>
                <span className="flex-1 truncate text-sm font-bold text-ink">{category.name}</span>
                <span className="text-sm font-extrabold text-leaf-700">
                  {formatPercent(category.accuracy)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ProfileBody({ profile }: { profile: PlayerProfile }) {
  const { user, stats } = profile
  const relation = RELATION_LABEL[profile.relation]

  return (
    <div className="space-y-5">
      <header className="flex flex-col items-center gap-2">
        <RankBadge code={user.rank.code} size="lg" />
        <div>
          <h2 className="text-xl font-extrabold text-ink">{user.name}</h2>
          <p className="text-sm font-semibold text-sand-500">@{user.username}</p>
        </div>
        {relation && (
          <span className="rounded-full bg-leaf-100 px-3 py-0.5 text-xs font-extrabold text-leaf-700">
            {relation}
          </span>
        )}
      </header>

      {/* Rank, level and total XP are on the leaderboard already; how far the
          player is from the next level isn't shown to others. */}
      <section aria-label="Nível">
        <p className="text-sm font-extrabold text-ink">
          {user.rank.name} · Nível {user.level}
        </p>
        <p className="mt-1 text-xs font-semibold text-sand-500">
          {stats.total_xp.toLocaleString('pt-BR')} XP na temporada
        </p>
      </section>

      <dl aria-label="Elos" className="grid grid-cols-2 gap-2">
        <EloTile label="Maior elo" rank={profile.best_rank} />
        <EloTile label="Mês passado" rank={profile.last_season_rank} />
      </dl>

      <ProfileTabs profile={profile} />

      <p className="text-xs font-semibold text-sand-400">
        Joga desde {memberSince(profile.member_since)}
      </p>
    </div>
  )
}

function Bone({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded-full bg-sand-100 ${className}`} />
}

/**
 * Same layout and heights as ProfileBody, so the card doesn't jump from a
 * small spinner box to a full-screen profile when the data lands. What the
 * tapped row already knows (name, handle, rank, level) shows right away.
 */
function ProfileSkeleton({ user }: { user?: PublicUser }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <header className="flex flex-col items-center gap-2">
        {user ? (
          <>
            <RankBadge code={user.rank.code} size="lg" />
            <div>
              <h2 className="text-xl font-extrabold text-ink">{user.name}</h2>
              <p className="text-sm font-semibold text-sand-500">@{user.username}</p>
            </div>
          </>
        ) : (
          <>
            <Bone className="h-16 w-16 rounded-2xl" />
            <div className="space-y-1.5 py-0.5">
              <Bone className="h-6 w-36" />
              <Bone className="mx-auto h-4 w-20" />
            </div>
          </>
        )}
      </header>

      <div>
        {user ? (
          <p className="text-sm font-extrabold text-ink">
            {user.rank.name} · Nível {user.level}
          </p>
        ) : (
          <Bone className="mx-auto h-5 w-32" />
        )}
        <Bone className="mx-auto mt-1 h-4 w-20" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((index) => (
          <span key={index} className="block h-[5.75rem] animate-pulse rounded-2xl bg-sand-50" />
        ))}
      </div>

      <div>
        <span className="block h-10 animate-pulse rounded-2xl bg-sand-100" />
        <div className="mt-3 flex justify-center gap-3">
          {[0, 1, 2].map((index) => (
            <span key={index} className="block h-36 w-24 animate-pulse rounded-2xl bg-sand-50" />
          ))}
        </div>
      </div>

      <Bone className="mx-auto h-4 w-44" />
    </div>
  )
}

/**
 * Another player's public profile, opened from the ranking and the friends
 * list. Shows only game stats — the API never sends e-mail or activity dates.
 */
export function PlayerProfileModal({
  userId,
  preview,
  onClose,
}: {
  userId: string | null
  /** The tapped row's player, shown while the full profile loads. */
  preview?: PublicUser | null
  onClose: () => void
}) {
  // Keep showing the last player while the modal animates closed.
  const [shownId, setShownId] = useState(userId)
  const [shownPreview, setShownPreview] = useState(preview)
  if (userId != null && userId !== shownId) {
    setShownId(userId)
    setShownPreview(preview)
  }

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['player', shownId],
    queryFn: () => api.get<PlayerProfile>(`/players/${shownId}`),
    enabled: shownId != null,
  })

  return (
    <Modal
      open={userId != null}
      onClose={onClose}
      label={data ? `Perfil de ${data.user.name}` : 'Perfil do jogador'}
    >
      <div className="-mx-6 max-h-[calc(100dvh-10rem)] overflow-y-auto px-6">
        {isError ? (
          <div className="space-y-3 py-6">
            <Glyph as={AppIcons.warning} className="mx-auto h-8 w-8 text-sand-400" />
            <p className="text-sm font-semibold text-sand-600">
              {error instanceof ApiError ? error.message : 'Não foi possível carregar o perfil.'}
            </p>
            <Button variant="secondary" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : isPending || !data ? (
          <ProfileSkeleton user={shownPreview?.id === shownId ? shownPreview : undefined} />
        ) : (
          <ProfileBody profile={data} />
        )}
      </div>
      <Button variant="secondary" full onClick={onClose}>
        Fechar
      </Button>
    </Modal>
  )
}

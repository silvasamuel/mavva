import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { PlayerProfile } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Spinner } from '@/components/ui/Spinner'
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
    <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sand-500">{children}</h3>
  )
}

function ProfileBody({ profile }: { profile: PlayerProfile }) {
  const { user, stats } = profile
  const relation = RELATION_LABEL[profile.relation]
  const duels = user.duel_wins + user.duel_losses + user.duel_draws
  const toNext = Math.max(0, stats.xp_for_next_level - stats.xp_into_level)

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

      <section aria-label="Nível">
        <p className="text-sm font-extrabold text-ink">
          {user.rank.name} · Nível {user.level}
        </p>
        <ProgressBar
          value={stats.xp_into_level}
          max={stats.xp_for_next_level}
          color="bg-grain-400"
          className="mx-auto mt-2 h-2.5"
        />
        <p className="mt-1 text-xs font-semibold text-sand-500">
          {stats.total_xp.toLocaleString('pt-BR')} XP · faltam {toNext.toLocaleString('pt-BR')} para
          o nível {user.level + 1}
        </p>
      </section>

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

      <section>
        <SectionTitle>
          Conquistas · {profile.achievements_unlocked} de {profile.achievements_total}
        </SectionTitle>
        {profile.recent_achievements.length > 0 ? (
          <ul aria-label="Conquistas mais recentes" className="grid grid-cols-2 gap-2 text-left">
            {profile.recent_achievements.map((achievement) => (
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

      <p className="text-xs font-semibold text-sand-400">
        Joga desde {memberSince(profile.member_since)}
      </p>
    </div>
  )
}

/**
 * Another player's public profile, opened from the ranking and the friends
 * list. Shows only game stats — the API never sends e-mail or activity dates.
 */
export function PlayerProfileModal({
  userId,
  onClose,
}: {
  userId: string | null
  onClose: () => void
}) {
  // Keep showing the last player while the modal animates closed.
  const [shownId, setShownId] = useState(userId)
  if (userId != null && userId !== shownId) setShownId(userId)

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
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8 text-leaf-500" />
          </div>
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

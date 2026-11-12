import type { DashboardData } from '@/types/api'
import { Card, CardTitle } from '@/components/ui/Card'
import { StatTile } from '@/components/StatTile'
import { formatPercent, formatStudyTime } from '@/lib/format'
import { AppIcons, CategoryGlyph } from '@/lib/icons'

/**
 * The player's own numbers: the same tiles other players see on the profile
 * card, plus what only they get (season XP, study time, every category).
 */
export function ProfileStats({ data }: { data: DashboardData }) {
  const { stats, duels } = data
  const duelCount = duels.wins + duels.losses + duels.draws
  // Best first; ties go to the category with more answers behind the number.
  const practiced = data.categories
    .filter((category) => category.answered > 0)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.answered - a.answered)

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <CardTitle>Estatísticas</CardTitle>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile
            icon={stats.current_streak > 0 ? AppIcons.streak : AppIcons.streakOff}
            value={stats.current_streak === 1 ? '1 dia' : `${stats.current_streak} dias`}
            label="Sequência"
            hint={`recorde ${stats.longest_streak}`}
          />
          <StatTile
            icon={AppIcons.check}
            value={formatPercent(stats.accuracy)}
            label="Precisão"
            hint={`${stats.questions_answered.toLocaleString('pt-BR')} respondidas`}
          />
          <StatTile icon={AppIcons.star} value={stats.perfect_sessions} label="Sessões perfeitas" />
          <StatTile
            icon={AppIcons.duels}
            value={`${duels.wins}V ${duels.draws}E ${duels.losses}D`}
            label="Duelos"
            hint={
              duelCount > 0
                ? `${formatPercent(duels.wins / duelCount)} de vitórias`
                : 'nenhum ainda'
            }
          />
          <StatTile
            icon={AppIcons.manna}
            value={stats.total_xp.toLocaleString('pt-BR')}
            label="XP na temporada"
            hint={`nível ${stats.level}`}
          />
          <StatTile
            icon={AppIcons.timer}
            value={formatStudyTime(stats.total_time_seconds)}
            label="Tempo de estudo"
          />
        </dl>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Por categoria</CardTitle>
        {practiced.length === 0 ? (
          <p className="text-sm font-semibold text-sand-400">
            Complete um quiz para ver a sua precisão em cada categoria.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {practiced.map((category) => (
              <li
                key={category.id}
                className="flex items-center gap-2 rounded-2xl bg-sand-50 px-3 py-2"
              >
                <span className="shrink-0 text-leaf-700">
                  <CategoryGlyph slug={category.slug} emoji={category.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {category.name}
                </span>
                <span className="text-xs font-semibold text-sand-400">
                  {category.answered} {category.answered === 1 ? 'resposta' : 'respostas'}
                </span>
                <span className="w-12 text-right text-sm font-extrabold text-leaf-700">
                  {formatPercent(category.accuracy)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

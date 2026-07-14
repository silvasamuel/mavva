import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Achievement } from '@/types/api'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Spinner } from '@/components/ui/Spinner'

export function AchievementsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: () => api.get<Achievement[]>('/achievements'),
  })

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }

  const unlockedCount = data.filter((achievement) => achievement.unlocked_at).length

  return (
    <div className="animate-float-up space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Conquistas</h1>
        <p className="text-sm font-semibold text-sand-500">
          {unlockedCount} de {data.length} desbloqueadas
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((achievement) => {
          const unlocked = Boolean(achievement.unlocked_at)
          return (
            <Card
              key={achievement.code}
              className={
                unlocked ? 'ring-2 ring-grain-300' : 'opacity-70 grayscale'
              }
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden>
                  {achievement.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{achievement.name}</p>
                  <p className="text-xs font-semibold text-sand-500">{achievement.description}</p>
                  {!unlocked && achievement.progress_target != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar
                        value={achievement.progress_current ?? 0}
                        max={achievement.progress_target}
                        className="h-2 flex-1"
                        color="bg-grain-400"
                      />
                      <span className="text-[10px] font-extrabold text-sand-500">
                        {achievement.progress_current}/{achievement.progress_target}
                      </span>
                    </div>
                  )}
                  {unlocked && (
                    <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wide text-grain-600">
                      Desbloqueada 🎉
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

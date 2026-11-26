import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { LeagueDetail } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/format'
import { AppIcons, Glyph, type Icon } from '@/lib/icons'
import { SupporterNotice } from './PlayButton'
import { STATUS_LABEL, STATUS_PILL, leagueTagline } from './labels'
import type { LeagueContext } from './useLeague'

function sections(
  league: LeagueDetail
): { to: string; label: string; icon: Icon; badge?: boolean }[] {
  return [
    { to: '', label: 'Visão geral', icon: AppIcons.home },
    { to: 'ranking', label: 'Ranking', icon: AppIcons.ranking },
    {
      to: 'games',
      label: league.format === 'cup' ? 'Chaveamento' : 'Rodadas',
      icon: league.format === 'cup' ? AppIcons.duels : AppIcons.season,
      badge: league.my_match_id != null,
    },
    { to: 'players', label: 'Jogadores', icon: AppIcons.users },
  ]
}

/**
 * One league: its header and its own menu (a side column on desktop, a row
 * of tabs on a phone) around the section being viewed.
 */
export function LeagueLayout() {
  const { leagueId } = useParams()
  const {
    data: league,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => api.get<LeagueDetail>(`/leagues/${leagueId}`),
    retry: false,
  })

  if (isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-leaf-500" />
      </div>
    )
  }
  if (!league) {
    const missing = error instanceof ApiError && error.status === 404
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="font-extrabold text-ink">
          {missing ? 'Liga não encontrada' : 'Não foi possível carregar a liga'}
        </p>
        <p className="mt-1 text-sm font-semibold text-sand-500">
          {missing
            ? 'Ela pode ter sido apagada, ou você não foi convidado.'
            : 'Verifique a conexão e tente de novo.'}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {!missing && (
            <Button variant="secondary" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          )}
          <Link to="/leagues">
            <Button>Ver minhas ligas</Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="animate-float-up space-y-4">
      <header>
        <Link to="/leagues" className="text-xs font-extrabold text-leaf-700 hover:underline">
          ← Ligas
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-extrabold">{league.name}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${STATUS_PILL[league.status]}`}
          >
            {STATUS_LABEL[league.status]}
          </span>
        </div>
        <p className="text-sm font-semibold text-sand-500">
          {leagueTagline(league)} ·{' '}
          {league.status === 'finished' || league.status === 'incomplete'
            ? `encerrou em ${formatDate(league.ends_on)}`
            : `termina em ${formatDate(league.ends_on)}`}
        </p>
      </header>

      {!league.can_play && <SupporterNotice />}

      <div className="gap-5 md:grid md:grid-cols-[12.5rem_minmax(0,1fr)]">
        <nav
          aria-label={`Menu da liga ${league.name}`}
          className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-white/70 p-1 shadow-card backdrop-blur-sm md:sticky md:top-24 md:mb-0 md:flex-col md:self-start md:p-2"
        >
          {sections(league).map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.to === ''}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-extrabold transition-colors ${
                  isActive
                    ? 'bg-leaf-50 text-leaf-700 ring-2 ring-inset ring-leaf-200'
                    : 'text-sand-600 hover:bg-sand-100'
                }`
              }
            >
              <Glyph as={section.icon} className="h-5 w-5" />
              {section.label}
              {section.badge && (
                // A dot, not a label: "sua vez" would wrap in the narrow side menu.
                <span className="ml-auto flex items-center" title="Sua vez de jogar">
                  <span className="h-2.5 w-2.5 rounded-full bg-leaf-500 ring-2 ring-leaf-100" />
                  <span className="sr-only">sua vez</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet context={{ league } satisfies LeagueContext} />
        </div>
      </div>
    </div>
  )
}

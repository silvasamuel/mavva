import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { League, LeagueList } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/format'
import { AppIcons, Glyph } from '@/lib/icons'
import { SupporterNotice } from './PlayButton'
import { FORMAT_LABEL, STATUS_LABEL, STATUS_PILL, leagueTagline } from './labels'

function LeagueCard({ league }: { league: League }) {
  const invited = league.my_status === 'invited'
  return (
    <li>
      <Link
        to={`/leagues/${league.id}`}
        className="block rounded-3xl bg-white/80 p-4 shadow-card backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              league.format === 'cup' ? 'bg-grain-100 text-grain-700' : 'bg-leaf-100 text-leaf-700'
            }`}
            aria-hidden
          >
            <Glyph
              as={league.format === 'cup' ? AppIcons.ranking : AppIcons.chart}
              className="h-6 w-6"
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-extrabold text-ink">{league.name}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${STATUS_PILL[league.status]}`}
              >
                {STATUS_LABEL[league.status]}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-sand-500">
              {leagueTagline(league)} · de @{league.owner.username}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-sand-400">
              {league.status === 'finished' && league.champion
                ? `Campeão: @${league.champion.username}`
                : league.status === 'incomplete'
                  ? `Encerrou em ${formatDate(league.ends_on)} sem campeão`
                  : `Termina em ${formatDate(league.ends_on)}`}
            </p>
          </div>
          {invited ? (
            <span className="shrink-0 rounded-full bg-grain-400 px-2.5 py-1 text-xs font-extrabold text-grain-900">
              Convite
            </span>
          ) : league.my_match_id ? (
            <span className="shrink-0 rounded-full bg-leaf-500 px-2.5 py-1 text-xs font-extrabold text-white">
              Sua vez
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  )
}

function Section({ title, leagues }: { title: string; leagues: League[] }) {
  if (leagues.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-sand-600">
        {title} · {leagues.length}
      </h2>
      <ul className="space-y-2">
        {leagues.map((league) => (
          <LeagueCard key={league.id} league={league} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Every league the player is in or was invited to: invites first, then the
 * ones being played, the ones still gathering players and the history.
 */
export function LeaguesPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => api.get<LeagueList>('/leagues'),
  })

  const leagues = data?.leagues ?? []
  const invites = leagues.filter((l) => l.my_status === 'invited' && l.status === 'recruiting')
  const mine = leagues.filter((l) => l.my_status === 'active')
  const active = mine.filter((l) => l.status === 'active')
  const recruiting = mine.filter((l) => l.status === 'recruiting')
  const past = leagues.filter((l) => l.status === 'finished' || l.status === 'incomplete')

  return (
    <div className="animate-float-up mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Ligas</h1>
          <p className="text-sm font-semibold text-sand-500">
            Competições fechadas, só para quem você convidar: {FORMAT_LABEL.points.toLowerCase()} ou{' '}
            {FORMAT_LABEL.cup.toLowerCase()}.
          </p>
        </div>
        {data?.can_play && (
          <Link to="/leagues/new">
            <Button>Criar liga</Button>
          </Link>
        )}
      </header>

      {data && !data.can_play && <SupporterNotice />}

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-leaf-500" />
        </div>
      ) : isError ? (
        <Card>
          <p className="text-sm font-semibold text-sand-500">Não foi possível carregar as ligas.</p>
          <Button className="mt-3" variant="secondary" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </Card>
      ) : leagues.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Glyph as={AppIcons.league} className="h-10 w-10" />}
            title="Você ainda não está em nenhuma liga"
            description={
              data?.can_play
                ? 'Crie uma, escolha os temas e convide a sua turma.'
                : 'Quando alguém convidar você, o convite aparece aqui.'
            }
          />
        </Card>
      ) : (
        <>
          <Section title="Convites" leagues={invites} />
          <Section title="Em andamento" leagues={active} />
          <Section title="Aguardando início" leagues={recruiting} />
          <Section title="Encerradas" leagues={past} />
        </>
      )}
    </div>
  )
}

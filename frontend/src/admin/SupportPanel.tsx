import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate, formatDateTime, formatReais } from '@/lib/format'
import { AppIcons, Glyph, type Icon } from '@/lib/icons'
import type { AdminSupport, AdminSupportPayment } from './types'

const STATUS: Record<AdminSupportPayment['status'], { label: string; pill: string }> = {
  approved: { label: 'Aprovado', pill: 'bg-leaf-100 text-leaf-700' },
  pending: { label: 'Pendente', pill: 'bg-grain-100 text-grain-800' },
  expired: { label: 'Expirado', pill: 'bg-sand-100 text-sand-600' },
  cancelled: { label: 'Cancelado', pill: 'bg-red-50 text-red-600' },
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

/** Donations: how much came in, who gave what, and the latest Pix charges. */
export function SupportPanel() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['admin', 'support'],
    queryFn: () => api.get<AdminSupport>('/admin/support'),
  })

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-leaf-500" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <p className="text-sm font-semibold text-sand-500">Não foi possível carregar as doações.</p>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Doações</h1>
        <p className="text-sm font-semibold text-sand-500">
          Ofertas via Pix e quem está com o selo de Apoiador.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={AppIcons.heart}
          label="Total doado"
          value={formatReais(data.total_cents)}
          hint="todas as ofertas aprovadas"
        />
        <Stat
          icon={AppIcons.check}
          label="Ofertas aprovadas"
          value={fmt(data.approved_count)}
          hint={`${fmt(data.pending_count)} pendentes`}
        />
        <Stat
          icon={AppIcons.users}
          label="Apoiadores ativos"
          value={fmt(data.active_supporters)}
          hint="selo válido hoje"
        />
        <Stat
          icon={AppIcons.chart}
          label="Doadores"
          value={fmt(data.donors.length)}
          hint="pelo menos uma oferta aprovada"
        />
      </div>

      <Card>
        <CardTitle>Por usuário</CardTitle>
        {data.donors.length === 0 ? (
          <p className="text-sm font-semibold text-sand-500">Nenhuma oferta aprovada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-sand-100 text-xs font-extrabold uppercase tracking-wide text-sand-500">
                <tr>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Ofertas</th>
                  <th className="px-4 py-3">Última</th>
                  <th className="px-4 py-3">Selo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-50">
                {data.donors.map((donor) => (
                  <tr key={donor.user_id}>
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-ink">{donor.name}</p>
                      <p className="text-xs font-semibold text-sand-500">@{donor.username}</p>
                    </td>
                    <td className="px-4 py-3 font-extrabold tabular-nums">
                      {formatReais(donor.total_cents)}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{fmt(donor.donations)}</td>
                    <td className="px-4 py-3 font-semibold">
                      {formatDate(donor.last_donation_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                          donor.is_supporter
                            ? 'bg-grain-100 text-grain-800'
                            : 'bg-sand-100 text-sand-500'
                        }`}
                      >
                        {donor.is_supporter
                          ? `Ativo até ${formatDate(donor.supporter_until)}`
                          : `Venceu em ${formatDate(donor.supporter_until)}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Últimas cobranças</CardTitle>
        {data.recent.length === 0 ? (
          <p className="text-sm font-semibold text-sand-500">Nenhum Pix gerado ainda.</p>
        ) : (
          <ul className="divide-y divide-sand-50">
            {data.recent.map((payment) => {
              const status = STATUS[payment.status]
              return (
                <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-ink">
                      {payment.name}{' '}
                      <span className="font-semibold text-sand-500">@{payment.username}</span>
                    </p>
                    <p className="text-xs font-semibold text-sand-400">
                      {formatDateTime(payment.created_at)} · {payment.provider} ·{' '}
                      {payment.provider_payment_id}
                    </p>
                  </div>
                  <span className="font-extrabold tabular-nums">
                    {formatReais(payment.amount_cents)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${status.pill}`}
                  >
                    {status.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: Icon
  label: string
  value: string
  hint: string
}) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-sand-500">
        <Glyph as={icon} className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-3xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-semibold text-sand-400">{hint}</p>
    </Card>
  )
}

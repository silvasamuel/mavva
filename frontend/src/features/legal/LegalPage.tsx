import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { PageMeta } from '@/components/PageMeta'
import { LEGAL_UPDATED } from './legal'

export function LegalPage({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10">
      <PageMeta
        title={`${title} · Mavva`}
        description={`${title} do Mavva, atualizados em ${LEGAL_UPDATED}.`}
      />
      <Link to="/" className="mb-8 self-start" aria-label="Voltar ao início">
        <Logo size="md" />
      </Link>
      <article className="space-y-6 rounded-3xl bg-white/85 p-6 shadow-card backdrop-blur-sm sm:p-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="text-xs font-bold uppercase tracking-wide text-sand-500">
            Última atualização: {LEGAL_UPDATED}
          </p>
        </header>
        <div className="space-y-5 text-sm font-semibold leading-relaxed text-sand-700 [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-extrabold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
      </article>
      <p className="mt-6 text-center text-xs font-semibold text-sand-500">
        <Link to="/termos" className="text-leaf-700 hover:underline">
          Termos de Uso
        </Link>
        <span className="text-sand-400"> · </span>
        <Link to="/privacidade" className="text-leaf-700 hover:underline">
          Política de Privacidade
        </Link>
        <span className="text-sand-400"> · </span>
        <Link to="/register" className="text-leaf-700 hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  )
}

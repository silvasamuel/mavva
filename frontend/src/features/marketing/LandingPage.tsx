import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { PageMeta } from '@/components/PageMeta'
import { Button } from '@/components/ui/Button'
import { AppIcons, Glyph } from '@/lib/icons'
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/seo'

const FEATURES = [
  {
    icon: AppIcons.study,
    title: 'Quiz bíblico',
    text: 'Perguntas de múltipla escolha com referência e explicação. Antigo e Novo Testamento, do fácil ao expert.',
  },
  {
    icon: AppIcons.review,
    title: 'Revisão inteligente',
    text: 'A repetição espaçada devolve cada pergunta na hora certa para fixar de verdade.',
  },
  {
    icon: AppIcons.duels,
    title: 'Duelos',
    text: 'Desafie um amigo ou um adversário aleatório para provar quem conhece melhor as escrituras.',
  },
  {
    icon: AppIcons.crown,
    title: 'Elos e maná',
    text: 'Suba de Semente a Celeiro, cumpra a meta diária e mantenha a sequência.',
  },
]

export function LandingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <PageMeta title={SITE_TITLE} description={SITE_DESCRIPTION} />
      <header className="flex flex-col items-center text-center">
        <Logo size="lg" />
        <h1 className="mt-8 text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
          Quiz bíblico diário para estudar a Palavra
        </h1>
        <p className="mt-4 max-w-xl text-base font-semibold text-sand-600 sm:text-lg">
          <strong>O Mavva é um app gratuito para estudar a Bíblia de um jeito leve e
          divertido.</strong>{' '}
          Faça quizzes, revise o que aprendeu, desafie amigos em duelos e acompanhe seu
          progresso — um pouco de maná novo a cada manhã.
        </p>
        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
          <Link to="/register" className="flex-1">
            <Button full>Começar grátis</Button>
          </Link>
          <Link to="/login" className="flex-1">
            <Button full variant="secondary">
              Já tenho conta
            </Button>
          </Link>
        </div>
      </header>

      <section className="mt-14" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="text-center text-xs font-extrabold uppercase tracking-wider text-sand-500">
          Como funciona
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-3xl bg-white/80 p-5 shadow-card backdrop-blur-sm"
            >
              <span className="text-leaf-700">
                <Glyph as={feature.icon} className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-lg font-extrabold">{feature.title}</h3>
              <p className="mt-1 text-sm font-semibold text-sand-600">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 rounded-3xl bg-leaf-700 px-6 py-10 text-center text-white" aria-labelledby="comecar">
        <h2 id="comecar" className="text-2xl font-extrabold">
          Comece o estudo de hoje
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-white/80">
          Crie sua conta gratuitamente em menos de um minuto.
        </p>
        <Link to="/register" className="mt-6 inline-block">
          <Button variant="gold">Criar conta</Button>
        </Link>
      </section>

      <footer className="mt-12 text-center text-xs font-semibold text-[#fefaec]">
        <p>“O maná... era como semente de coentro” — Êxodo 16:31</p>
        <p className="mt-2">
          <Link to="/login" className="text-grain-200 underline-offset-2 hover:text-white hover:underline">
            Entrar
          </Link>
          <span className="text-white/50"> · </span>
          <Link to="/register" className="text-grain-200 underline-offset-2 hover:text-white hover:underline">
            Cadastrar
          </Link>
        </p>
      </footer>
    </div>
  )
}

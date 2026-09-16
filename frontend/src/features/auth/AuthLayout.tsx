import { motion } from 'framer-motion'
import { Logo } from '@/components/Logo'
import { PageMeta } from '@/components/PageMeta'
import { LegalLinks } from '@/features/legal/LegalLinks'

export function AuthLayout({
  title,
  children,
  robots,
}: {
  title: string
  children: React.ReactNode
  robots?: string
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <PageMeta title={`${title} · Mavva`} robots={robots} />
      <Logo size="lg" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md rounded-3xl bg-white/85 p-8 shadow-card backdrop-blur-sm"
      >
        <h1 className="mb-6 text-center text-2xl font-extrabold">{title}</h1>
        {children}
      </motion.div>
      <p className="max-w-xs text-center text-xs font-semibold text-sand-500">
        “O maná... era como semente de coentro” — alimento novo a cada manhã. (Êx 16:31)
      </p>
      <LegalLinks />
    </div>
  )
}

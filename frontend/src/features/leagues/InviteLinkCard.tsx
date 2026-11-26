import { useState } from 'react'
import type { LeagueDetail } from '@/types/api'
import { Button } from '@/components/ui/Button'
import { inviteUrl } from './inviteLink'

/**
 * The league's invite link, to paste anywhere or send on WhatsApp. Whoever
 * opens it lands on the invitation (after signing up, if they are new).
 */
export function InviteLinkCard({ league }: { league: LeagueDetail }) {
  const [copied, setCopied] = useState(false)
  if (!league.invite_code) return null
  const url = inviteUrl(league.invite_code)
  const message = `Entre na minha liga "${league.name}" no Mavva, o quiz bíblico: ${url}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-2xl bg-leaf-50 p-3 ring-1 ring-leaf-200">
      <p className="text-xs font-extrabold uppercase tracking-wide text-leaf-800">
        Link de convite
      </p>
      <p className="mt-1 text-xs font-semibold text-sand-600">
        Quem abrir o link recebe o convite. Quem ainda não tem conta se cadastra e já cai nele.
      </p>
      <label className="mt-2 block">
        <span className="sr-only">Link de convite da liga</span>
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-xl border-2 border-leaf-200 bg-white px-3 py-2 font-mono text-xs text-ink"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()}>
          {copied ? 'Copiado!' : 'Copiar link'}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="sm" variant="secondary">
            Enviar no WhatsApp
          </Button>
        </a>
      </div>
    </div>
  )
}

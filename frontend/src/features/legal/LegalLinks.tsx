import { Link } from 'react-router-dom'

export function LegalLinks({
  className = 'text-sand-500',
  linkClassName = 'text-leaf-700 hover:underline',
}: {
  className?: string
  linkClassName?: string
}) {
  return (
    <p className={`text-center text-xs font-semibold ${className}`}>
      <Link to="/termos" className={linkClassName}>
        Termos
      </Link>
      <span className="opacity-50"> · </span>
      <Link to="/privacidade" className={linkClassName}>
        Privacidade
      </Link>
    </p>
  )
}

import { useEffect } from 'react'
import { setPageMeta } from '@/lib/seo'

export function PageMeta({
  title,
  description,
  robots,
}: {
  title?: string
  description?: string
  robots?: string
}) {
  useEffect(() => {
    setPageMeta({ title, description, robots })
    return () => {
      if (robots) setPageMeta({ robots: undefined })
    }
  }, [title, description, robots])
  return null
}

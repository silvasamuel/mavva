import type { AnnouncementKind } from '@/types/api'
import { AppIcons, type Icon } from '@/lib/icons'

/** How each kind of announcement looks, here and in the admin. */
export const ANNOUNCEMENT_KINDS: Record<
  AnnouncementKind,
  { label: string; icon: Icon; tile: string; pill: string }
> = {
  feature: {
    label: 'Novidade',
    icon: AppIcons.rocket,
    tile: 'bg-leaf-100 text-leaf-700',
    pill: 'bg-leaf-100 text-leaf-800',
  },
  improvement: {
    label: 'Melhoria',
    icon: AppIcons.sparkle,
    tile: 'bg-grain-100 text-grain-700',
    pill: 'bg-grain-100 text-grain-800',
  },
  fix: {
    label: 'Correção',
    icon: AppIcons.wrench,
    tile: 'bg-sand-100 text-sand-600',
    pill: 'bg-sand-100 text-sand-700',
  },
  notice: {
    label: 'Aviso',
    icon: AppIcons.megaphone,
    tile: 'bg-red-50 text-red-600',
    pill: 'bg-red-50 text-red-700',
  },
}

export const ANNOUNCEMENT_KIND_ORDER: AnnouncementKind[] = ['feature', 'improvement', 'fix', 'notice']

import { useOutletContext } from 'react-router-dom'
import type { LeagueDetail } from '@/types/api'

export interface LeagueContext {
  league: LeagueDetail
}

/** The league loaded by LeagueLayout, for the section rendered inside it. */
export function useLeague(): LeagueDetail {
  return useOutletContext<LeagueContext>().league
}

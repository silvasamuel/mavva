import type { Difficulty, QuestionType, Testament } from '@/types/api'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  timezone: string
  daily_goal_xp: number
  created_at: string
  total_xp: number
  level: number
  current_streak: number
  questions_answered: number
  accuracy: number | null
}

export interface AdminUserList {
  items: AdminUser[]
  total: number
  limit: number
  offset: number
}

export interface AdminOption {
  text: string
  is_correct: boolean
}

export interface AdminAnswer {
  text: string
}

export interface AdminQuestionListItem {
  id: string
  external_id: string
  type: QuestionType
  text: string
  difficulty: Difficulty
  category_id: number
  category_name: string
  is_active: boolean
}

export interface AdminQuestionList {
  items: AdminQuestionListItem[]
  total: number
  limit: number
  offset: number
}

export interface AdminQuestionDetail {
  id: string
  external_id: string
  type: QuestionType
  text: string
  explanation: string
  divergence_note: string | null
  testament: Testament
  book: string
  chapter: number
  verse_start: number
  verse_end: number | null
  theme: string
  difficulty: Difficulty
  category_id: number
  subcategory: string | null
  tags: string[]
  is_active: boolean
  options: AdminOption[]
  accepted_answers: AdminAnswer[]
}

export interface AdminCategory {
  id: number
  slug: string
  name: string
  icon: string
}

export interface AdminQuestionUpdate {
  text?: string
  explanation?: string
  divergence_note?: string | null
  book?: string
  chapter?: number
  verse_start?: number
  verse_end?: number | null
  theme?: string
  difficulty?: Difficulty
  category_id?: number
  subcategory?: string | null
  tags?: string[]
  is_active?: boolean
  options?: AdminOption[]
  accepted_answers?: AdminAnswer[]
}

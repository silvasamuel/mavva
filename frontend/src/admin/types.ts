import type { Difficulty, FlagReason, QuestionDraft, QuestionType, Testament } from '@/types/api'

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
  difficulty: Difficulty
  category_id: number
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
  difficulty?: Difficulty
  is_active?: boolean
  options?: AdminOption[]
  accepted_answers?: AdminAnswer[]
}

export interface ContentStatus {
  mode: 'github' | 'local'
  dirty_files: string[]
}

export interface ContentPublish {
  mode: 'github' | 'local'
  published: string[]
  commit_url: string | null
  pr_url: string | null
}

export interface AdminFlag {
  id: string
  created_at: string
  reason: FlagReason
  comment: string | null
  status: 'open' | 'resolved' | 'dismissed'
  reporter_name: string
  reporter_username: string
  question_id: string
  question_text: string
  question_external_id: string
  question_active: boolean
}

export interface AdminProposal {
  id: string
  created_at: string
  status: 'pending' | 'approved' | 'rejected'
  author_name: string
  author_username: string
  payload: QuestionDraft
  question_id: string | null
}

export interface AdminReviewInbox {
  open_flags: number
  pending_proposals: number
  flags: AdminFlag[]
  proposals: AdminProposal[]
}

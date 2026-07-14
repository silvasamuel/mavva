// Mirrors backend Pydantic schemas (backend/app/schemas).

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type QuestionType = 'multiple_choice' | 'open_answer'
export type Testament = 'old' | 'new'
export type QuizMode = 'practice' | 'review'

export interface User {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  timezone: string
  daily_goal_xp: number
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

export interface Category {
  id: number
  slug: string
  name: string
  description: string
  icon: string
  question_count: number
  answered: number
  accuracy: number | null
}

export interface BibleReference {
  book: string
  book_name: string
  chapter: number
  verse_start: number
  verse_end: number | null
  display: string
}

export interface QuestionOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  position: number
  type: QuestionType
  text: string
  difficulty: Difficulty
  category_name: string
  category_icon: string
  options: QuestionOption[]
  answered: boolean
}

export interface QuizSession {
  id: string
  mode: QuizMode
  question_count: number
  correct_count: number
  answered_count: number
  completed: boolean
  timer_seconds: number | null
  filters: Record<string, unknown>
  questions: QuizQuestion[]
}

export interface QuizAbandonResult {
  answered_count: number
  wrong_count: number
  xp_penalty: number
}

export interface AnswerFeedback {
  is_correct: boolean
  correct_option_id: string | null
  correct_answer: string | null
  explanation: string
  divergence_note: string | null
  reference: BibleReference
  xp_earned: number
}

export interface QuizComplete {
  correct_count: number
  question_count: number
  answered_count: number
  accuracy: number
  xp_earned: number
  bonus_xp: number
  duration_seconds: number
  level: { current: number; leveled_up: boolean; xp_into_level: number; xp_for_next: number }
  streak: { current: number; extended_today: boolean }
  daily_goal: { target: number; earned_today: number; achieved: boolean }
  unlocked_achievements: Achievement[]
}

export interface Achievement {
  code: string
  name: string
  description: string
  icon: string
  unlocked_at?: string | null
  progress_current?: number
  progress_target?: number
}

export interface DashboardData {
  stats: {
    total_xp: number
    level: number
    xp_into_level: number
    xp_for_next_level: number
    current_streak: number
    longest_streak: number
    questions_answered: number
    correct_answers: number
    accuracy: number | null
    perfect_sessions: number
    total_time_seconds: number
  }
  daily_goal: { target: number; earned_today: number; achieved: boolean }
  evolution: { date: string; xp: number; questions: number; correct: number }[]
  categories: {
    id: number
    slug: string
    name: string
    icon: string
    description: string
    answered: number
    accuracy: number | null
  }[]
  recent_sessions: {
    id: string
    mode: QuizMode
    completed_at: string | null
    correct_count: number
    question_count: number
    xp_earned: number
    duration_seconds: number | null
    filters: Record<string, unknown>
  }[]
  reviews_due: number
  recommendations: { type: 'review' | 'category'; category_slug: string | null; reason: string }[]
}

export interface ReviewSummary {
  due_today: number
  due_this_week: number
  total_items: number
}

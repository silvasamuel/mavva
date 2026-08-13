// Mirrors backend Pydantic schemas (backend/app/schemas).

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type QuestionType = 'multiple_choice' | 'open_answer'
export type Testament = 'old' | 'new'
export type QuizMode = 'practice' | 'review' | 'duel'

export interface User {
  id: string
  name: string
  username: string
  email: string
  role: 'user' | 'admin'
  timezone: string
  daily_goal_xp: number
}

// --- Social: friends and duels ---

export interface PublicUser {
  id: string
  username: string
  name: string
  level: number
  rank: { code: string; name: string }
  duel_wins: number
  duel_losses: number
  duel_draws: number
}

export type RelationStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends'

export interface UserSearchResult {
  user: PublicUser
  relation: RelationStatus
}

export interface FriendRequest {
  id: string
  user: PublicUser
  created_at: string
}

export interface FriendsOverview {
  friends: PublicUser[]
  incoming: FriendRequest[]
  sent: FriendRequest[]
}

export interface LeaderboardEntry {
  position: number
  total_xp: number
  is_me: boolean
  user: PublicUser
}

export interface GlobalLeaderboard {
  top: LeaderboardEntry[]
  me: LeaderboardEntry
  total_players: number
}

export interface FriendsLeaderboard {
  entries: LeaderboardEntry[]
}

export type DuelStatus = 'open' | 'active' | 'finished' | 'expired' | 'cancelled'

export interface DuelSide {
  user: PublicUser | null
  correct: number
  answered: number
  finished: boolean
  time_seconds: number
}

export interface Duel {
  id: string
  mode: 'random' | 'friend'
  status: DuelStatus
  created_at: string
  expires_at: string
  me: DuelSide
  rival: DuelSide
  my_session_id: string | null
  my_result: 'win' | 'loss' | 'draw' | null
  xp_change: number | null
  question_count: number
  timer_seconds: number
}

export interface DuelRecord {
  wins: number
  losses: number
  draws: number
  current_streak: number
  best_streak: number
  win_rate: number | null
}

export interface DuelListResponse {
  items: Duel[]
  record: DuelRecord
  awaiting_me: number
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
  timer_remaining: number | null
}

export interface QuizSession {
  id: string
  mode: QuizMode
  question_count: number
  correct_count: number
  answered_count: number
  completed: boolean
  timer_seconds: number | null
  duel_id: string | null
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
  rank: { code: string; name: string; rank_up: boolean }
  streak: { current: number; extended_today: boolean }
  daily_goal: { target: number; earned_today: number; achieved: boolean }
  unlocked_achievements: Achievement[]
}

export interface Achievement {
  code: string
  name: string
  description: string
  icon: string
  xp_reward: number
  unlocked_at?: string | null
  progress_current?: number
  progress_target?: number
}

export interface DashboardData {
  stats: {
    total_xp: number
    level: number
    rank: {
      code: string
      name: string
      min_level: number
      max_level: number | null
      next_code: string | null
      next_name: string | null
      next_level: number | null
    }
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
  friend_requests: number
  duels: {
    wins: number
    losses: number
    draws: number
    current_streak: number
    best_streak: number
    win_rate: number | null
    awaiting_me: number
  }
  recommendations: { type: 'review' | 'category'; category_slug: string | null; reason: string }[]
}

export interface ReviewSummary {
  due_today: number
  due_this_week: number
  total_items: number
}

export interface BibleBook {
  slug: string
  name: string
  testament: Testament
}

export type FlagReason = 'wrong_text' | 'wrong_answer' | 'wrong_reference' | 'other'

export interface QuestionDraft {
  category_id: number
  type: QuestionType
  text: string
  options: { text: string; correct: boolean }[] | null
  accepted_answers: string[] | null
  explanation: string
  divergence_note: string | null
  book: string
  chapter: number
  verse_start: number
  verse_end: number | null
  difficulty: Difficulty
}

export interface FlagCreateResponse {
  id: string
  status: 'open' | 'resolved' | 'dismissed'
}

export interface ProposalCreateResponse {
  id: string
  status: 'pending' | 'approved' | 'rejected'
}

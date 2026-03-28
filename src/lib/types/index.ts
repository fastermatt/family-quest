export type Role = 'parent' | 'child'
export type RecurrenceType = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'once'
export type TaskStatus = 'pending' | 'submitted' | 'approved' | 'rejected'
export type GatingMode = 'all_tasks' | 'specific_tasks' | 'always_available'
export type RewardType = 'money' | 'experience' | 'privilege' | 'item' | 'xp'
export type BonusType = 'open_bounty' | 'assigned'
export type BonusStatus = 'active' | 'claimed' | 'completed' | 'expired'
export type RequestStatus = 'pending' | 'approved' | 'denied' | 'conditional'

export interface Family {
  id: string
  name: string
  family_xp: number
  family_level: number
  created_at: string
}

export interface Profile {
  id: string
  family_id: string
  auth_user_id: string | null
  name: string
  role: Role
  avatar_emoji: string
  xp_total: number
  current_level: number
  current_streak: number
  longest_streak: number
  streak_last_updated: string | null
  access_token: string | null
  birthday: string | null
  theme_preferences: Record<string, string> | null
  created_at: string
}

export type TimeOfDay = 'anytime' | 'morning' | 'afternoon' | 'evening'

export interface TaskTemplate {
  id: string
  family_id: string
  name: string
  category: string
  recurrence_type: RecurrenceType
  recurrence_days: number[]
  reset_hour: number
  photo_required: boolean
  xp_value: number
  difficulty_stars: number
  time_of_day: TimeOfDay
  active: boolean
  created_by: string
  created_at: string
}

export interface TaskAssignment {
  id: string
  template_id: string
  assigned_to: string
}

export interface TaskInstance {
  id: string
  template_id: string
  assigned_to: string
  due_date: string
  status: TaskStatus
  photo_url: string | null
  photo_challenge_prompt: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_note: string | null
  xp_awarded: number
  task_template?: TaskTemplate
}

export interface Privilege {
  id: string
  family_id: string
  name: string
  description: string
  gating_mode: GatingMode
  required_template_ids: string[]
  visible_to: string[]
  created_by: string
}

export interface PrivilegeRequest {
  id: string
  privilege_id: string
  requested_by: string
  status: RequestStatus
  response_note: string | null
  time_limit_minutes: number | null
  created_at: string
  responded_at: string | null
  privilege?: Privilege
}

export interface BonusTask {
  id: string
  family_id: string
  name: string
  description: string
  type: BonusType
  assigned_to: string | null
  reward_type: RewardType
  reward_value: string
  reward_description: string
  xp_bonus: number
  status: BonusStatus
  claimed_by: string | null
  deadline: string | null
  photo_required: boolean
  created_by: string
  created_at: string
}

export interface PhotoChallenge {
  id: string
  category: string
  prompt_text: string
  emoji: string
}

export interface WeeklyStanding {
  id: string
  family_id: string
  profile_id: string
  week_start: string
  xp_earned: number
  tasks_completed: number
  bonus_tasks_completed: number
  streak_peak: number
  titles_earned: string[]
}

export interface TimeWindow { days: number[]; start: string; end: string }
export interface FamilySettings {
  enabled: boolean
  game_privilege_id: string|null
  timezone: string
  weekday_minutes: number
  weekend_minutes: number
  bathroom_bonus_minutes: number
  weekend_requires_chores: boolean
  require_parent_approval: boolean
  school_windows: TimeWindow[]
  gaming_windows: TimeWindow[]
  bedtime_windows: TimeWindow[]
  revision: number
}
export interface JobOffer {
  id: string; title: string; description: string; criteria: string; price_cents: number
  status: 'offered'|'accepted'|'submitted'|'changes_requested'|'approved'|'cancelled'
  child_note: string|null; review_note: string|null; created_at: string
}
export interface MoneyEntry {
  id: string; kind: 'opening_iou'|'job_credit'|'cash_settlement'
  description: string; debt_delta_cents: number; cash_delta_cents: number; created_at: string
}
export interface FamilyOverview {
  childId: string; childName: string; day: string; settings: FamilySettings
  game: {eligible: boolean; requiredCount: number; remainingTasks: number; grantedSeconds: number; extraGrantSeconds: number; usedSeconds: number; remainingSeconds: number; allowed: boolean; paused: boolean; reason: string; bathroomGranted: boolean; nextChangeAt: string}
  money: {initialized: boolean; debtRemainingCents: number; cashOwedCents: number; entries: MoneyEntry[]}
  jobs: JobOffer[]
  devices: {id:string;name:string;version:string|null;last_seen_at:string|null;applied_revision:number|null;applied_at:string|null}[]
}
export interface FamilyPolicy {
  enabled: boolean; revision: number; day: string; timezone: string
  eligible: boolean; allowed: boolean; reason: string; expiresAt: string
}

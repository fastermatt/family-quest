import type { ProofType } from './proof.ts'
import { PROOF_TYPES, cleanQuestions } from './proof.ts'

export const RECURRENCE_TYPES = ['daily', 'weekdays', 'weekly', 'once'] as const
export const TIMES_OF_DAY = ['anytime', 'morning', 'afternoon', 'evening'] as const

export interface ChoreInput {
  name?: unknown
  category?: unknown
  recurrence_type?: unknown
  recurrence_days?: unknown
  proof_type?: unknown
  cutoff_time?: unknown
  photo_hint?: unknown
  link_url?: unknown
  questions?: unknown
  required?: unknown
  xp_value?: unknown
  time_of_day?: unknown
  active?: unknown
}

/**
 * Turn untrusted form input into columns we are willing to write.
 * Returns { error } for anything a parent should fix.
 */
export function cleanChore(input: ChoreInput, partial: boolean): { values?: Record<string, unknown>; error?: string } {
  const v: Record<string, unknown> = {}

  if (input.name !== undefined || !partial) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) return { error: 'Give the chore a name.' }
    v.name = name.slice(0, 80)
  }
  if (input.category !== undefined) {
    v.category = typeof input.category === 'string' && input.category.trim() ? input.category.trim().slice(0, 40) : 'General'
  } else if (!partial) v.category = 'General'

  if (input.recurrence_type !== undefined || !partial) {
    const r = input.recurrence_type ?? 'daily'
    if (!(RECURRENCE_TYPES as readonly unknown[]).includes(r)) return { error: 'Pick how often.' }
    v.recurrence_type = r
  }
  if (input.recurrence_days !== undefined || !partial) {
    const days = Array.isArray(input.recurrence_days) ? input.recurrence_days : []
    const clean = [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    v.recurrence_days = clean
  }
  if (v.recurrence_type === 'weekly' && Array.isArray(v.recurrence_days) && v.recurrence_days.length === 0) {
    return { error: 'Pick at least one day.' }
  }

  if (input.proof_type !== undefined || !partial) {
    const p = (input.proof_type ?? 'photo') as ProofType
    if (!PROOF_TYPES.includes(p)) return { error: 'Pick how Grey proves it.' }
    v.proof_type = p
    v.photo_required = p === 'photo' // keeps older code paths in sync
  }

  if (input.cutoff_time !== undefined) {
    if (input.cutoff_time === null || input.cutoff_time === '') v.cutoff_time = null
    else if (typeof input.cutoff_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(input.cutoff_time)) {
      v.cutoff_time = input.cutoff_time.length === 5 ? `${input.cutoff_time}:00` : input.cutoff_time
    } else return { error: 'That time does not look right.' }
  }

  if (input.photo_hint !== undefined) {
    const h = typeof input.photo_hint === 'string' ? input.photo_hint.trim().slice(0, 120) : ''
    v.photo_hint = h || null
  }

  if (input.link_url !== undefined) {
    const raw = typeof input.link_url === 'string' ? input.link_url.trim() : ''
    if (!raw) v.link_url = null
    else {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
      try {
        const u = new URL(withScheme)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
        v.link_url = u.toString().slice(0, 300)
      } catch {
        return { error: 'That link does not look right.' }
      }
    }
  }

  if (input.questions !== undefined) {
    const qs = cleanQuestions(input.questions)
    v.questions = qs.length ? qs : null
  }
  if (v.proof_type === 'written' && input.questions !== undefined && !(v.questions as string[] | null)?.length) {
    return { error: 'Add at least one question for him to answer.' }
  }

  if (input.required !== undefined) v.required = input.required !== false
  if (input.active !== undefined) v.active = input.active !== false

  if (input.xp_value !== undefined || !partial) {
    const xp = Math.round(Number(input.xp_value ?? 100))
    v.xp_value = Number.isFinite(xp) ? Math.max(0, Math.min(xp, 1000)) : 100
  }

  if (input.time_of_day !== undefined || !partial) {
    const t = input.time_of_day ?? 'anytime'
    v.time_of_day = (TIMES_OF_DAY as readonly unknown[]).includes(t) ? t : 'anytime'
  }

  return { values: v }
}

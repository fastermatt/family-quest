// Progress history: pure helpers, no I/O. The rules mirror countsTowardUnlock
// (src/lib/proof.ts) on purpose but do not import it, so the two can change
// independently.
import { timeToMinutes, zonedParts } from './dates.ts'

/** A required chore counts as done for a day if approved, excused, or sent with a photo / written answer. */
export function dayDone(status: string, proofType: string | null | undefined): boolean {
  if (status === 'approved' || status === 'excused') return true
  if (status === 'submitted') return proofType === 'photo' || proofType === 'written'
  return false
}

/** "Missed" = marked missed, or still pending / sent back after the day is over. */
export function dayMissed(status: string, past: boolean): boolean {
  if (status === 'missed') return true
  return past && (status === 'pending' || status === 'rejected')
}

export interface OnTimeInput {
  status: string
  proofType: string | null | undefined
  cutoffTime?: string | null
  submittedAt?: string | null
  dueDate?: string
}

/**
 * Done, and finished by the cutoff (Denver time). No cutoff means on time.
 * Excused or approved-without-a-timestamp chores can't be late. A chore sent on
 * a later day than it was due is late even if the clock time looks early.
 */
export function isOnTime(i: OnTimeInput): boolean {
  if (!dayDone(i.status, i.proofType)) return false
  if (!i.cutoffTime) return true
  if (i.status === 'excused' || !i.submittedAt) return true
  const sent = zonedParts(new Date(i.submittedAt))
  if (i.dueDate && sent.date > i.dueDate) return false
  return sent.minutes <= timeToMinutes(i.cutoffTime)
}

export interface DayItem {
  status: string
  proofType: string | null | undefined
  /** false = extra chore; ignored for percentages. Missing means required. */
  required?: boolean
  cutoffTime?: string | null
  submittedAt?: string | null
  dueDate?: string
}

export interface DaySummary {
  total: number
  done: number
  missed: number
  excused: number
  onTime: number
  pct: number
}

/** Required chores only. `past` = the day is over (pending counts as missed). */
export function summarizeDay(items: DayItem[], past = true): DaySummary {
  const s: DaySummary = { total: 0, done: 0, missed: 0, excused: 0, onTime: 0, pct: 0 }
  for (const it of items) {
    if (it.required === false) continue
    s.total++
    if (dayDone(it.status, it.proofType)) {
      s.done++
      if (it.status === 'excused') s.excused++
      if (isOnTime(it)) s.onTime++
    } else if (dayMissed(it.status, past)) {
      s.missed++
    }
  }
  s.pct = s.total ? Math.round((s.done / s.total) * 100) : 0
  return s
}

export interface HistoryDay extends DaySummary {
  date: string
}

export interface PeriodSummary {
  /** Share of required chores done. */
  pct: number
  /** Share of the chores that got done that were done by their cutoff. */
  onTimePct: number
  perfectDays: number
  daysTracked: number
}

const isPerfect = (d: DaySummary) => d.total > 0 && d.pct === 100

/**
 * Roll up days. Days with no chores are ignored. When `today` is given and
 * today is still unfinished, it is left out so a morning check does not read
 * as a bad day.
 */
export function summarizePeriod(days: HistoryDay[], today?: string): PeriodSummary {
  let total = 0
  let done = 0
  let onTime = 0
  let perfectDays = 0
  let daysTracked = 0
  for (const d of days) {
    if (d.total === 0) continue
    if (d.date === today && !isPerfect(d)) continue
    daysTracked++
    total += d.total
    done += d.done
    onTime += d.onTime
    if (isPerfect(d)) perfectDays++
  }
  return {
    pct: total ? Math.round((done / total) * 100) : 0,
    onTimePct: done ? Math.round((onTime / done) * 100) : 0,
    perfectDays,
    daysTracked,
  }
}

/**
 * Current and best run of perfect days. Days with no chores are skipped (they
 * neither add nor break). Today only counts when complete; an unfinished today
 * is skipped too, so the streak stays alive until the day is over.
 * `days` must be in date order, oldest first.
 */
export function streaks(days: HistoryDay[], today?: string): { current: number; best: number } {
  let run = 0
  let best = 0
  for (const d of days) {
    if (d.total === 0) continue
    if (d.date === today && !isPerfect(d)) continue
    if (isPerfect(d)) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return { current: run, best }
}

export type DayLook = 'perfect' | 'partial' | 'missed' | 'none'

/** How a day looks on the kid's week strip. Today is never "missed": it is still in progress. */
export function dayLook(d: DaySummary, isToday: boolean): DayLook {
  if (d.total === 0) return 'none'
  if (d.pct === 100) return 'perfect'
  if (!isToday && (d.done === 0 || d.missed > 0)) return 'missed'
  return 'partial'
}

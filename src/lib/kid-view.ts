import { countsTowardUnlock, isPastCutoff, proofTypeOf } from './proof.ts'
import { timeToMinutes } from './dates.ts'

// Display-only helpers for the kid home screen. None of this decides what
// unlocks a reward; that stays in proof.ts and on the server.

export interface KidChore {
  id: string
  status: string
  task_template: {
    proof_type?: string | null
    photo_required?: boolean | null
    cutoff_time?: string | null
    required?: boolean | null
    time_of_day?: string | null
  }
}

export interface ChoreGroups<T> {
  fix: T[]
  next: T[]
  waiting: T[]
  finished: T[]
}

const TOD: Record<string, number> = { morning: 0, anytime: 1, afternoon: 2, evening: 3 }

/** Late first, then earliest cutoff (none last), then time of day. Stable. */
export function sortDoNext<T extends KidChore>(tasks: T[], nowMinutes: number): T[] {
  const key = (t: T) => {
    const cut = t.task_template.cutoff_time
    return {
      late: isPastCutoff(cut, nowMinutes) ? 0 : 1,
      cut: cut ? timeToMinutes(cut) : Number.POSITIVE_INFINITY,
      tod: TOD[t.task_template.time_of_day ?? 'anytime'] ?? 1,
    }
  }
  return tasks
    .map((t, i) => ({ t, i, k: key(t) }))
    .sort((a, b) => a.k.late - b.k.late || a.k.cut - b.k.cut || a.k.tod - b.k.tod || a.i - b.i)
    .map((x) => x.t)
}

export function groupChores<T extends KidChore>(tasks: T[], nowMinutes: number): ChoreGroups<T> {
  const fix: T[] = []
  const next: T[] = []
  const waiting: T[] = []
  const finished: T[] = []
  for (const t of tasks) {
    if (t.status === 'rejected') fix.push(t)
    else if (t.status === 'submitted') {
      if (proofTypeOf(t.task_template) === 'photo') finished.push(t)
      else waiting.push(t)
    } else if (t.status === 'approved') finished.push(t)
    else next.push(t) // pending, missed, anything unknown stays visible
  }
  return { fix, next: sortDoNext(next, nowMinutes), waiting, finished }
}

export interface Progress {
  total: number
  toDo: number
  waiting: number
  done: number
  allDone: boolean
}

/** Counts among required chores only. Extras never inflate "to do". */
export function progressCounts(tasks: KidChore[]): Progress {
  const req = tasks.filter((t) => t.task_template.required !== false)
  let toDo = 0
  let waiting = 0
  let done = 0
  for (const t of req) {
    if (countsTowardUnlock(t)) done++
    if (t.status === 'pending' || t.status === 'rejected' || t.status === 'missed') toDo++
    else if (t.status === 'submitted' && proofTypeOf(t.task_template) !== 'photo') waiting++
  }
  return { total: req.length, toDo, waiting, done, allDone: req.length > 0 && done === req.length }
}

export function progressLine(p: Progress): string {
  if (p.allDone) return 'All chores shown. Rewards are open.'
  if (p.toDo === 0 && p.waiting > 0) return 'Your part is done. Waiting for a parent.'
  const parts: string[] = []
  if (p.toDo > 0) parts.push(`${p.toDo} to do`)
  if (p.waiting > 0) parts.push(`${p.waiting} waiting on a parent`)
  return parts.join(' · ')
}

/** True for addresses that only work on the home network. */
export function isPrivateHost(url: string | null | undefined): boolean {
  if (!url) return false
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/** Visible action text, also used for the aria-label. */
export function actionLabel(type: string, status: string): string {
  if (status === 'rejected') return 'Redo'
  if (type === 'photo') return 'Take photo'
  if (type === 'imessage_video') return 'Sent it'
  return 'Done'
}

/** From 4:00 PM (family time) unfinished required chores get loud. */
export const CRUNCH_MINUTES = 16 * 60

/** Required chores the kid still has to do (not counting ones waiting on a parent). */
export function choresLeft(tasks: KidChore[]): number {
  return tasks.filter(
    (t) => t.task_template.required !== false && (t.status === 'pending' || t.status === 'rejected' || t.status === 'missed')
  ).length
}

export function isCrunchTime(nowMinutes: number, left: number): boolean {
  return nowMinutes >= CRUNCH_MINUTES && left > 0
}

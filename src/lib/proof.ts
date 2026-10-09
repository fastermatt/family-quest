import { timeToMinutes } from './dates.ts'

// How a chore is proven. The point of the app is that "done" means "shown",
// not "claimed".
export type ProofType = 'photo' | 'imessage_video' | 'check'

export const PROOF_TYPES: ProofType[] = ['photo', 'imessage_video', 'check']

export const PROOF_META: Record<
  ProofType,
  { icon: string; label: string; action: string; help: string }
> = {
  photo: {
    icon: '📸',
    label: 'Photo proof',
    action: 'Take photo',
    help: 'Take a photo that shows it is done.',
  },
  imessage_video: {
    icon: '🎬',
    label: 'Video by iMessage',
    action: 'I sent the video',
    help: 'Record a video, text it to Dad, then tap the button.',
  },
  check: {
    icon: '✓',
    label: 'Parent confirms',
    action: 'I did it',
    help: 'Tap when it is finished. A parent confirms.',
  },
}

interface ProofSource {
  proof_type?: string | null
  photo_required?: boolean | null
}

/**
 * Works both before and after the proof_type column exists, so the app keeps
 * running while the migration is pending.
 */
export function proofTypeOf(t: ProofSource | null | undefined): ProofType {
  if (t?.proof_type && (PROOF_TYPES as string[]).includes(t.proof_type)) {
    return t.proof_type as ProofType
  }
  return t?.photo_required ? 'photo' : 'check'
}

// What the photo should show, guessed from the chore name. Used when a parent
// has not written their own instruction. Order matters: first match wins.
const PHOTO_GUESSES: [RegExp, string][] = [
  [/\bbed\b/i, 'Your made bed: covers pulled up, pillows on top'],
  [/kitchen|dish/i, 'The clean counters and the empty sink'],
  [/homework|school|worksheet|study/i, 'Your finished homework, with your name showing'],
  [/poop/i, 'The bag of poop you picked up, with the clean yard behind it'],
  [/egg/i, "Today's eggs in your hand or the basket"],
  [/chicken.*water|water.*chicken/i, 'The chicken waterer filled with clean water'],
  [/chicken/i, 'The chicken feeder filled up'],
  [/trash|garbage|recycl/i, 'The trash can out at the curb'],
  [/laundry|clothes|fold/i, 'Your folded clothes, put away'],
  [/room|tidy|clean up/i, 'Your tidy room, floor showing'],
  [/feed|food/i, 'The full food bowl'],
  [/water/i, 'The full water bowl'],
  [/dog|walk/i, 'You and the dog on the walk'],
  [/vacuum|sweep|mop/i, 'The clean floor'],
  [/yard|weed|rake|mow/i, 'The finished yard'],
]

export function defaultPhotoHint(choreName: string): string {
  const hit = PHOTO_GUESSES.find(([re]) => re.test(choreName))
  return hit ? hit[1] : `The finished job: ${choreName.trim().toLowerCase()}`
}

/** The instruction Grey sees under a photo chore. */
export function photoPrompt(t: { name: string; photo_hint?: string | null }): string {
  const hint = t.photo_hint?.trim() || defaultPhotoHint(t.name)
  return `📸 ${hint}`
}

export interface UnlockTask {
  id: string
  status: string
  template_id?: string | null
  task_template?: ProofSource & { required?: boolean | null }
}

/**
 * Does this chore count toward unlocking rewards?
 * - approved always counts.
 * - a submitted photo counts straight away (the evidence exists; a parent can
 *   still reject it, which re-locks the reward).
 * - everything else needs a parent to confirm first.
 */
export function countsTowardUnlock(task: UnlockTask): boolean {
  if (task.task_template?.required === false) return true
  if (task.status === 'approved') return true
  if (task.status === 'submitted') return proofTypeOf(task.task_template) === 'photo'
  return false
}

interface PrivilegeLike {
  gating_mode: string
  required_template_ids?: string[] | null
}

export function privilegeUnlocked(priv: PrivilegeLike, tasks: UnlockTask[]): boolean {
  if (priv.gating_mode === 'always_available') return true

  // No chores today means something is wrong (generation failed). Stay locked
  // rather than hand out rewards for free.
  const required = tasks.filter((t) => t.task_template?.required !== false)
  if (required.length === 0) return false

  if (priv.gating_mode === 'all_tasks') {
    return required.every(countsTowardUnlock)
  }
  if (priv.gating_mode === 'specific_tasks') {
    const ids = priv.required_template_ids ?? []
    if (ids.length === 0) return false
    return ids.every((id) => {
      const match = tasks.find((t) => t.template_id === id)
      return match ? countsTowardUnlock(match) : false
    })
  }
  return false
}

/** Has the cutoff passed for a chore that is still open? */
export function isPastCutoff(cutoffTime: string | null | undefined, nowMinutes: number): boolean {
  if (!cutoffTime) return false
  return nowMinutes > timeToMinutes(cutoffTime)
}

/** Unwrap Supabase embeds and drop chores a parent has turned off. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function activeOnly<T extends { task_template?: any }>(rows: T[] | null | undefined): (T & { task_template: any })[] {
  return (rows ?? [])
    .map((r) => ({ ...r, task_template: Array.isArray(r.task_template) ? r.task_template[0] : r.task_template }))
    .filter((r) => r.task_template?.active !== false)
}

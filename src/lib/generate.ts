import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, zonedParts } from './dates'
import { countsTowardUnlock, proofTypeOf } from './proof'

interface Template {
  id: string
  created_at?: string
  recurrence_type: string
  recurrence_days: number[] | null
  photo_required?: boolean | null
  proof_type?: string | null
  task_assignments?: { assigned_to: string }[]
}

export function runsOn(
  t: Pick<Template, 'recurrence_type' | 'recurrence_days' | 'created_at'>,
  dayOfWeek: number,
  dayOfMonth: number,
  today?: string
) {
  switch (t.recurrence_type) {
    case 'once':
      // A one-off shows up on the day a parent adds it.
      return !!t.created_at && !!today && zonedParts(new Date(t.created_at)).date === today
    case 'daily':
      return true
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5
    case 'weekly':
      return t.recurrence_days?.includes(dayOfWeek) ?? false
    case 'monthly':
      return t.recurrence_days?.includes(dayOfMonth) ?? false
    default:
      return false
  }
}

export interface GenerateResult {
  date: string
  created: number
  closedOut: number
}

/**
 * Create today's chores (in the family timezone) and close out anything left
 * over from earlier days as "missed" so yesterday never leaks into today.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateTaskInstances(supabase: SupabaseClient<any, any, any>, now: Date = new Date()): Promise<GenerateResult> {
  const { date, dayOfWeek, dayOfMonth } = zonedParts(now)

  // 1. Settle yesterday's streak while statuses are still as he left them.
  await settleStreaks(supabase, addDays(date, -1)).catch((e) => console.error('streak:', e))

  // 2. Anything still pending from before today was not done.
  let closedOut = 0
  const { data: stale, error: staleErr } = await supabase
    .from('task_instances')
    .update({ status: 'missed' })
    .eq('status', 'pending')
    .lt('due_date', date)
    .select('id')
  if (staleErr) {
    // Before the migration the 'missed' status does not exist yet; carry on.
    console.error('close-out skipped:', staleErr.message)
  } else {
    closedOut = stale?.length ?? 0
  }

  // 3. Today's chores, in three queries instead of one per chore.
  const { data: templates, error: tErr } = await supabase
    .from('task_templates')
    .select('*, task_assignments(assigned_to)')
    .eq('active', true)
  if (tErr || !templates) throw new Error(`templates: ${tErr?.message ?? 'none'}`)

  const due = (templates as Template[]).filter((t) => runsOn(t, dayOfWeek, dayOfMonth, date))

  const { data: challenges } = await supabase.from('photo_challenges').select('prompt_text, emoji')
  const pool = challenges ?? []

  const rows = due.flatMap((t) =>
    (t.task_assignments ?? []).map((a) => {
      let prompt: string | null = null
      if (proofTypeOf(t) === 'photo' && pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)]
        prompt = `${pick.emoji} ${pick.prompt_text}`
      }
      return {
        template_id: t.id,
        assigned_to: a.assigned_to,
        due_date: date,
        status: 'pending',
        photo_challenge_prompt: prompt,
      }
    })
  )

  let created = 0
  if (rows.length) {
    const { data: inserted, error } = await supabase
      .from('task_instances')
      .upsert(rows, { onConflict: 'template_id,assigned_to,due_date', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`insert: ${error.message}`)
    created = inserted?.length ?? 0
  }

  return { date, created, closedOut }
}

/**
 * A day counts toward the streak when every required chore for it was shown
 * (approved, or a photo sent and not sent back). One miss resets it to 0.
 * Idempotent: a kid already settled for `day` is skipped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function settleStreaks(supabase: SupabaseClient<any, any, any>, day: string) {
  const { data: rows, error } = await supabase
    .from('task_instances')
    .select('assigned_to, status, task_template:task_templates(proof_type, photo_required, required, active)')
    .eq('due_date', day)
  if (error) throw new Error(error.message)

  const byKid = new Map<string, { status: string; task_template: Record<string, unknown> | null }[]>()
  for (const r of rows ?? []) {
    const tpl = (Array.isArray(r.task_template) ? r.task_template[0] : r.task_template) as Record<string, unknown> | null
    if (tpl?.active === false) continue
    byKid.set(r.assigned_to, [...(byKid.get(r.assigned_to) ?? []), { status: r.status, task_template: tpl }])
  }

  for (const [kidId, list] of byKid) {
    const required = list.filter((t) => t.task_template?.required !== false)
    if (!required.length) continue
    const { data: kid } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, streak_last_updated')
      .eq('id', kidId)
      .single()
    if (!kid) continue
    const last = kid.streak_last_updated ? String(kid.streak_last_updated).slice(0, 10) : null
    if (last === day) continue

    const allShown = required.every((t) => countsTowardUnlock({ id: '', status: t.status, task_template: t.task_template as never }))
    const streak = allShown ? (last === addDays(day, -1) ? kid.current_streak ?? 0 : 0) + 1 : 0
    await supabase
      .from('profiles')
      .update({
        current_streak: streak,
        longest_streak: Math.max(streak, kid.longest_streak ?? 0),
        streak_last_updated: day,
      })
      .eq('id', kidId)
  }
}

export { addDays }

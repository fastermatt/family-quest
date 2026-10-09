import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, zonedParts } from './dates'
import { proofTypeOf } from './proof'

interface Template {
  id: string
  recurrence_type: string
  recurrence_days: number[] | null
  photo_required?: boolean | null
  proof_type?: string | null
  task_assignments?: { assigned_to: string }[]
}

export function runsOn(t: Pick<Template, 'recurrence_type' | 'recurrence_days'>, dayOfWeek: number, dayOfMonth: number) {
  switch (t.recurrence_type) {
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

  // 1. Anything still pending from before today was not done.
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

  // 2. Today's chores, in three queries instead of one per chore.
  const { data: templates, error: tErr } = await supabase
    .from('task_templates')
    .select('*, task_assignments(assigned_to)')
    .eq('active', true)
  if (tErr || !templates) throw new Error(`templates: ${tErr?.message ?? 'none'}`)

  const due = (templates as Template[]).filter((t) => runsOn(t, dayOfWeek, dayOfMonth))

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

export { addDays }

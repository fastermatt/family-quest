// Server-side loading for the progress routes. Kept apart from history.ts so
// that file stays pure and testable.
import { addDays } from './dates'
import { summarizeDay, type DayItem, type HistoryDay } from './history'
import type { adminClient } from './session'

type Admin = ReturnType<typeof adminClient>

export interface HistoryRow extends DayItem {
  childId: string
  date: string
}

const PAGE = 1000

/** Every instance for these kids in [from, to], including chores turned off since. One round trip per 1000 rows. */
export async function loadHistoryRows(admin: Admin, kidIds: string[], from: string, to: string): Promise<HistoryRow[]> {
  if (!kidIds.length) return []
  const rows: HistoryRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('task_instances')
      .select('id, assigned_to, due_date, status, submitted_at, task_template:task_templates(proof_type, required, cutoff_time)')
      .in('assigned_to', kidIds)
      .gte('due_date', from)
      .lte('due_date', to)
      .order('due_date')
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const tpl = Array.isArray(r.task_template) ? r.task_template[0] : r.task_template
      if (!tpl) continue // template row is gone: we cannot tell if it was required
      rows.push({
        childId: r.assigned_to,
        date: r.due_date,
        status: r.status,
        proofType: tpl.proof_type,
        required: tpl.required !== false,
        cutoffTime: tpl.cutoff_time,
        submittedAt: r.submitted_at,
        dueDate: r.due_date,
      })
    }
    if (!data || data.length < PAGE) break
  }
  return rows
}

/** One summary per calendar day from `from` to `today`, oldest first, empty days included. */
export function buildDays(rows: HistoryRow[], from: string, today: string): HistoryDay[] {
  const byDate = new Map<string, HistoryRow[]>()
  for (const r of rows) {
    const list = byDate.get(r.date)
    if (list) list.push(r)
    else byDate.set(r.date, [r])
  }
  const days: HistoryDay[] = []
  for (let d = from; d <= today; d = addDays(d, 1)) {
    days.push({ date: d, ...summarizeDay(byDate.get(d) ?? [], d < today) })
  }
  return days
}

import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { zonedParts } from '@/lib/dates'
import { activeOnly } from '@/lib/proof'
import { scheduledReminderPayload } from '@/lib/reminder-schedule'
import { sendToProfiles } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_CRON_SECRET || process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const now = zonedParts()
  const time = `${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}`
  const admin = adminClient()
  const { data: schedules, error } = await admin.from('reminder_schedules').select('id, child_id, family_id').eq('enabled', true).eq('time', time)
  if (error) return NextResponse.json({ error: 'Could not load schedules.' }, { status: 503 })
  let accepted = 0, failed = 0, skipped = 0
  for (const schedule of schedules ?? []) {
    const { data: child, error: childError } = await admin.from('profiles').select('name').eq('id', schedule.child_id).eq('family_id', schedule.family_id).eq('role', 'child').maybeSingle()
    if (childError) { failed++; continue }
    if (!child) { skipped++; continue }
    const { data, error: taskError } = await admin.from('task_instances').select('status, task_template:task_templates(name, required, active)').eq('assigned_to', schedule.child_id).eq('due_date', now.date)
    if (taskError) { failed++; continue }
    // Claim after successful reads, before sending: one attempt per schedule/date,
    // including repeated fall-back clock times and overlapping scheduler invocations.
    const { error: claimError } = await admin.from('reminder_runs').insert({ slot: `custom:${schedule.id}`, day: now.date })
    if (claimError?.code === '23505') { skipped++; continue }
    if (claimError) { failed++; continue }
    const chores = activeOnly(data).map(r => ({ name: r.task_template?.name ?? 'Chore', required: r.task_template?.required !== false, status: r.status }))
    const result = await sendToProfiles(admin, [schedule.child_id], scheduledReminderPayload(child.name, chores, `custom-${schedule.id}-${now.date}`))
    accepted += result
    if (!result) failed++
  }
  return NextResponse.json({ ok: true, date: now.date, time, accepted, failed, skipped })
}

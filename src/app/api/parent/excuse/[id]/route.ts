import { NextRequest, NextResponse } from 'next/server'
import { bad, childInFamily, requireParent } from '@/lib/api-auth'
import { todayInTz } from '@/lib/dates'

export const dynamic = 'force-dynamic'

// A parent excuses a chore (sick, away, can't reach the lesson). Excused counts
// as done for rewards and the streak, and is shown as "Excused" everywhere.
// POST {undo: true} puts it back.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const { data: task } = await admin.from('task_instances').select('id, assigned_to, status, due_date').eq('id', id).maybeSingle()
  if (!task || !(await childInFamily(admin, me.family_id, task.assigned_to))) return bad('Chore not found.', 404)

  if (body.undo === true) {
    if (task.status !== 'excused') return bad('That chore is not excused.', 409)
    const back = task.due_date >= todayInTz() ? 'pending' : 'missed'
    const { error } = await admin.from('task_instances').update({ status: back, review_note: null, reviewed_at: null }).eq('id', id)
    if (error) return bad('That did not save. Try again.', 500)
    return NextResponse.json({ ok: true, status: back })
  }

  if (!['pending', 'rejected', 'missed'].includes(task.status)) return bad('Only chores that are not done can be excused.', 409)
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 120) : ''
  const { error } = await admin
    .from('task_instances')
    .update({ status: 'excused', reviewed_at: new Date().toISOString(), review_note: reason || null })
    .eq('id', id)
  if (error) return bad('That did not save. Try again.', 500)
  return NextResponse.json({ ok: true, status: 'excused' })
}

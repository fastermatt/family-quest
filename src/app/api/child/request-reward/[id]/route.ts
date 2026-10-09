import { NextRequest, NextResponse } from 'next/server'
import { bad, requireChild } from '@/lib/api-auth'
import { todayInTz } from '@/lib/dates'
import { privilegeUnlocked } from '@/lib/proof'

export const dynamic = 'force-dynamic'

// The lock is enforced here, not just greyed out in the browser.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params

  const { data: reward } = await admin
    .from('privileges')
    .select('id, gating_mode, required_template_ids, visible_to')
    .eq('id', id)
    .eq('family_id', me.family_id)
    .maybeSingle()
  if (!reward || (reward.visible_to?.length && !reward.visible_to.includes(me.id))) return bad('Reward not found.', 404)

  const { data: tasks } = await admin
    .from('task_instances')
    .select('id, template_id, status, task_template:task_templates(proof_type, photo_required, required)')
    .eq('assigned_to', me.id)
    .eq('due_date', todayInTz())

  const shaped = (tasks ?? []).map((t) => ({
    ...t,
    task_template: Array.isArray(t.task_template) ? t.task_template[0] : t.task_template,
  }))
  if (!privilegeUnlocked(reward, shaped)) return bad('Finish and show your chores first.', 403)

  const { data: open } = await admin
    .from('privilege_requests')
    .select('id')
    .eq('privilege_id', id)
    .eq('requested_by', me.id)
    .eq('status', 'pending')
    .limit(1)
  if (open?.length) return NextResponse.json({ ok: true, already: true })

  const { error } = await admin.from('privilege_requests').insert({ privilege_id: id, requested_by: me.id, status: 'pending' })
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}

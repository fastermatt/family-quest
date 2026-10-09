import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Approve, or send back to redo with a note.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : ''

  const { data: task } = await admin
    .from('task_instances')
    .select('id, status, assigned_to, due_date, task_template:task_templates(xp_value), child:profiles!task_instances_assigned_to_fkey(id, family_id)')
    .eq('id', id)
    .single()
  if (!task) return bad('Chore not found.', 404)

  const child = Array.isArray(task.child) ? task.child[0] : task.child
  if (!child || child.family_id !== me.family_id) return bad('Chore not found.', 404)

  if (action === 'reject') {
    if (!note) return bad('Say what needs fixing so he knows what to redo.')
    const { data, error } = await admin
      .from('task_instances')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), review_note: note })
      .eq('id', id)
      .eq('status', 'submitted')
      .select('id')
    if (error) return bad(error.message, 500)
    if (!data?.length) return bad('Already reviewed.', 409)

    // The reward is locked again; drop his open ask so he can ask once it is redone.
    await admin.from('privilege_requests').delete().eq('requested_by', child.id).eq('status', 'pending')
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (action !== 'approve') return bad('Unknown action.')

  const tpl = Array.isArray(task.task_template) ? task.task_template[0] : task.task_template
  const xp = tpl?.xp_value ?? 100

  // Only approve something still waiting, so a double tap cannot pay twice.
  const { data: approved, error } = await admin
    .from('task_instances')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), xp_awarded: xp, review_note: note || null })
    .eq('id', id)
    .eq('status', 'submitted')
    .select('id')
  if (error) return bad(error.message, 500)
  if (!approved?.length) return bad('Already reviewed.', 409)

  // Atomic increment; the streak is settled each morning from the day's results.
  const { error: xpErr } = await admin.rpc('award_xp', { p_child: child.id, p_family: me.family_id, p_xp: xp })
  if (xpErr) console.error('award_xp failed:', xpErr.message)

  return NextResponse.json({ ok: true, status: 'approved', xp })
}

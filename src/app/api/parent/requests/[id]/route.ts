import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { todayInTz } from '@/lib/dates'
import { activeOnly, privilegeUnlocked } from '@/lib/proof'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'approve' && body?.action !== 'deny') return bad('Unknown action.')

  const { data: request } = await admin
    .from('privilege_requests')
    .select('id, requested_by, privilege_id, child:profiles!privilege_requests_requested_by_fkey(family_id)')
    .eq('id', id)
    .single()
  const child = Array.isArray(request?.child) ? request?.child[0] : request?.child
  if (!request || child?.family_id !== me.family_id) return bad('Request not found.', 404)

  if (body.action === 'approve') {
    const { data: priv } = await admin
      .from('privileges')
      .select('gating_mode, required_template_ids')
      .eq('id', request.privilege_id)
      .single()
    const { data: tasks } = await admin
      .from('task_instances')
      .select('id, template_id, status, task_template:task_templates(proof_type, photo_required, required, active)')
      .eq('assigned_to', request.requested_by)
      .eq('due_date', todayInTz())
    const shaped = activeOnly(tasks)
    if (!priv || !privilegeUnlocked(priv, shaped)) {
      return bad('Locked again: a chore is not shown anymore. Check Needs you first.', 409)
    }
  }

  const { error } = await admin
    .from('privilege_requests')
    .update({
      status: body.action === 'approve' ? 'approved' : 'denied',
      responded_at: new Date().toISOString(),
      response_note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
    })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}

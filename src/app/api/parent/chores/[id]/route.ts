import { NextRequest, NextResponse } from 'next/server'
import { bad, childInFamily, requireParent } from '@/lib/api-auth'
import { cleanChore } from '@/lib/chores'
import { todayInTz } from '@/lib/dates'
import { generateTaskInstances } from '@/lib/generate'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ownChore(admin: any, familyId: string, id: string) {
  const { data } = await admin.from('task_templates').select('id').eq('id', id).eq('family_id', familyId).maybeSingle()
  return !!data
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  if (!(await ownChore(admin, me.family_id, id))) return bad('Chore not found.', 404)

  const body = await req.json().catch(() => ({}))
  const { values, error } = cleanChore(body, true)
  if (error || !values) return bad(error ?? 'Invalid change.')

  if (Object.keys(values).length) {
    const { error: upErr } = await admin.from('task_templates').update(values).eq('id', id)
    if (upErr) return bad(upErr.message, 500)
  }

  if (Array.isArray(body.assigned_to)) {
    const next: string[] = body.assigned_to
    if (!next.length) return bad('Pick who does it.')
    for (const childId of next) {
      if (!(await childInFamily(admin, me.family_id, childId))) return bad('Unknown child.')
    }
    await admin.from('task_assignments').delete().eq('template_id', id).not('assigned_to', 'in', `(${next.join(',')})`)
    await admin
      .from('task_assignments')
      .upsert(next.map((assigned_to) => ({ template_id: id, assigned_to })), { onConflict: 'template_id,assigned_to', ignoreDuplicates: true })
  }

  if (values.active === false) {
    // Off means off today too: drop today's copy if he has not started it.
    await admin.from('task_instances').delete().eq('template_id', id).eq('due_date', todayInTz()).eq('status', 'pending')
  } else if (values.active === true || values.recurrence_type !== undefined || values.recurrence_days !== undefined || Array.isArray(body.assigned_to)) {
    await generateTaskInstances(admin).catch((e) => console.error('generate after edit:', e))
  }

  return NextResponse.json({ ok: true })
}

// Chores with history are archived (turned off) so past proof is kept.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  if (!(await ownChore(admin, me.family_id, id))) return bad('Chore not found.', 404)

  const { count } = await admin
    .from('task_instances')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id)

  if ((count ?? 0) > 0) {
    await admin.from('task_templates').update({ active: false }).eq('id', id)
    await admin.from('task_instances').delete().eq('template_id', id).eq('due_date', todayInTz()).eq('status', 'pending')
    return NextResponse.json({ ok: true, archived: true })
  }
  await admin.from('task_assignments').delete().eq('template_id', id)
  await admin.from('task_templates').delete().eq('id', id)
  return NextResponse.json({ ok: true, deleted: true })
}

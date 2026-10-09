import { NextRequest, NextResponse } from 'next/server'
import { bad, childInFamily, requireParent } from '@/lib/api-auth'
import { cleanChore } from '@/lib/chores'
import { generateTaskInstances } from '@/lib/generate'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth

  const [{ data: chores }, { data: kids }] = await Promise.all([
    admin
      .from('task_templates')
      .select('*, task_assignments(assigned_to)')
      .eq('family_id', me.family_id)
      .order('active', { ascending: false })
      .order('created_at'),
    admin
      .from('profiles')
      .select('id, name, avatar_emoji')
      .eq('family_id', me.family_id)
      .eq('role', 'child')
      .order('name'),
  ])

  return NextResponse.json({
    children: (kids ?? []).map((k) => ({ id: k.id, name: k.name, emoji: k.avatar_emoji })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chores: (chores ?? []).map(({ task_assignments, ...c }: any) => ({
      ...c,
      assigned_to: (task_assignments ?? []).map((a: { assigned_to: string }) => a.assigned_to),
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))

  const { values, error } = cleanChore(body, false)
  if (error || !values) return bad(error ?? 'Invalid chore.')

  const assignees: string[] = Array.isArray(body.assigned_to) ? body.assigned_to : []
  if (!assignees.length) return bad('Pick who does it.')
  for (const id of assignees) {
    if (!(await childInFamily(admin, me.family_id, id))) return bad('Unknown child.')
  }

  const { data: chore, error: insErr } = await admin
    .from('task_templates')
    .insert({ ...values, family_id: me.family_id, created_by: me.id, reset_hour: 0, difficulty_stars: 1, active: true })
    .select('id')
    .single()
  if (insErr || !chore) return bad(insErr?.message ?? 'Could not save.', 500)

  const { error: aErr } = await admin
    .from('task_assignments')
    .insert(assignees.map((assigned_to) => ({ template_id: chore.id, assigned_to })))
  if (aErr) return bad(aErr.message, 500)

  // Put it on today's list now if it runs today, instead of waiting for morning.
  await generateTaskInstances(admin).catch((e) => console.error('generate after create:', e))

  return NextResponse.json({ ok: true, id: chore.id })
}

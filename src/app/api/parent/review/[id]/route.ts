import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { todayInTz } from '@/lib/dates'

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
    .select('id, status, assigned_to, due_date, task_template:task_templates(xp_value), child:profiles!task_instances_assigned_to_fkey(id, family_id, xp_total, current_streak, longest_streak, streak_last_updated)')
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

  const update: Record<string, unknown> = { xp_total: (child.xp_total ?? 0) + xp }

  // Streak: every chore for that day approved, counted once per day.
  const today = todayInTz()
  const lastStreak = child.streak_last_updated ? String(child.streak_last_updated).slice(0, 10) : null
  if (task.due_date === today && lastStreak !== today) {
    const { data: all } = await admin
      .from('task_instances')
      .select('status')
      .eq('assigned_to', child.id)
      .eq('due_date', today)
    if (all?.length && all.every((t) => t.status === 'approved')) {
      const streak = (child.current_streak ?? 0) + 1
      update.current_streak = streak
      update.longest_streak = Math.max(streak, child.longest_streak ?? 0)
      update.streak_last_updated = today
    }
  }
  await admin.from('profiles').update(update).eq('id', child.id)

  const { data: fam } = await admin.from('families').select('family_xp').eq('id', me.family_id).single()
  if (fam) {
    const familyXp = (fam.family_xp ?? 0) + xp
    await admin
      .from('families')
      .update({ family_xp: familyXp, family_level: Math.floor(familyXp / 5000) + 1 })
      .eq('id', me.family_id)
  }

  return NextResponse.json({ ok: true, status: 'approved', xp })
}

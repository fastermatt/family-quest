import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { todayInTz, zonedParts } from '@/lib/dates'

export const dynamic = 'force-dynamic'

// Everything the parent "Today" screen needs in one call.
export async function GET() {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const now = new Date()
  const date = todayInTz(now)

  const [{ data: meRow }, { data: family }, { data: members }] = await Promise.all([
    admin.from('profiles').select('id, name, avatar_emoji').eq('id', me.id).single(),
    admin.from('families').select('id, name').eq('id', me.family_id).single(),
    admin
      .from('profiles')
      .select('id, name, role, avatar_emoji, current_streak, xp_total, pin_hash')
      .eq('family_id', me.family_id)
      .order('role', { ascending: false })
      .order('name'),
  ])

  const kids = (members ?? []).filter((m) => m.role === 'child')
  const kidIds = kids.map((k) => k.id)

  const { data: tasks } = kidIds.length
    ? await admin
        .from('task_instances')
        .select('id, assigned_to, status, submitted_at, reviewed_at, review_note, photo_url, photo_challenge_prompt, task_template:task_templates(id, name, proof_type, photo_required, cutoff_time, required, xp_value, time_of_day)')
        .in('assigned_to', kidIds)
        .eq('due_date', date)
    : { data: [] }

  // Anything still waiting on a parent from earlier days, too.
  const { data: olderWaiting } = kidIds.length
    ? await admin
        .from('task_instances')
        .select('id, assigned_to, status, due_date, submitted_at, review_note, photo_url, photo_challenge_prompt, task_template:task_templates(id, name, proof_type, photo_required, cutoff_time, required, xp_value, time_of_day)')
        .in('assigned_to', kidIds)
        .eq('status', 'submitted')
        .lt('due_date', date)
        .order('due_date', { ascending: false })
        .limit(20)
    : { data: [] }

  const { data: requests } = kidIds.length
    ? await admin
        .from('privilege_requests')
        .select('id, requested_by, created_at, privilege:privileges(name)')
        .in('requested_by', kidIds)
        .eq('status', 'pending')
        .order('created_at')
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shape = (t: any) => {
    const tpl = Array.isArray(t.task_template) ? t.task_template[0] : t.task_template
    return {
      id: t.id,
      childId: t.assigned_to,
      status: t.status,
      dueDate: t.due_date ?? date,
      submittedAt: t.submitted_at,
      reviewNote: t.review_note,
      hasPhoto: !!t.photo_url,
      prompt: t.photo_challenge_prompt,
      template: tpl,
    }
  }

  return NextResponse.json({
    me: { id: me.id, name: meRow?.name ?? 'Parent', emoji: meRow?.avatar_emoji ?? '' },
    family: family ?? { id: me.family_id, name: 'Your family' },
    date,
    nowMinutes: zonedParts(now).minutes,
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      emoji: m.avatar_emoji,
      hasPin: !!m.pin_hash,
    })),
    children: kids.map((k) => ({
      id: k.id,
      name: k.name,
      emoji: k.avatar_emoji,
      streak: k.current_streak ?? 0,
      xp: k.xp_total ?? 0,
      tasks: (tasks ?? []).filter((t) => t.assigned_to === k.id).map(shape),
    })),
    olderWaiting: (olderWaiting ?? []).map(shape),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requests: (requests ?? []).map((r: any) => ({
      id: r.id,
      childId: r.requested_by,
      createdAt: r.created_at,
      reward: (Array.isArray(r.privilege) ? r.privilege[0] : r.privilege)?.name ?? 'Reward',
    })),
  })
}

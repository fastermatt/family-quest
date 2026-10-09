import { NextResponse } from 'next/server'
import { requireChild } from '@/lib/api-auth'
import { todayInTz, zonedParts } from '@/lib/dates'
import { activeOnly, privilegeUnlocked } from '@/lib/proof'

export const dynamic = 'force-dynamic'

// Grey's whole day: chores, what is locked, what he has asked for.
export async function GET() {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const now = new Date()
  const date = todayInTz(now)

  const [{ data: profile }, { data: tasks }, { data: rewards }, { data: requests }] = await Promise.all([
    admin.from('profiles').select('id, name, avatar_emoji, current_streak, xp_total').eq('id', me.id).single(),
    admin
      .from('task_instances')
      .select('id, template_id, status, submitted_at, review_note, photo_url, photo_challenge_prompt, task_template:task_templates(id, name, proof_type, photo_required, cutoff_time, required, xp_value, time_of_day, active, link_url)')
      .eq('assigned_to', me.id)
      .eq('due_date', date),
    admin
      .from('privileges')
      .select('id, name, description, gating_mode, required_template_ids, visible_to')
      .eq('family_id', me.family_id)
      .order('created_at'),
    admin
      .from('privilege_requests')
      .select('privilege_id, status, created_at')
      .eq('requested_by', me.id)
      .gte('created_at', new Date(now.getTime() - 36 * 3600 * 1000).toISOString()),
  ])

  const shaped = activeOnly(tasks).map((t) => ({
    id: t.id,
    template_id: t.template_id,
    status: t.status,
    submittedAt: t.submitted_at,
    reviewNote: t.review_note,
    hasPhoto: !!t.photo_url,
    prompt: t.photo_challenge_prompt,
    task_template: t.task_template,
  }))

  const order = { morning: 0, anytime: 1, afternoon: 2, evening: 3 } as Record<string, number>
  shaped.sort(
    (a, b) =>
      (order[a.task_template?.time_of_day ?? 'anytime'] ?? 1) - (order[b.task_template?.time_of_day ?? 'anytime'] ?? 1) ||
      String(a.task_template?.cutoff_time ?? '99').localeCompare(String(b.task_template?.cutoff_time ?? '99'))
  )

  const mine = (rewards ?? []).filter((r) => !r.visible_to?.length || r.visible_to.includes(me.id))

  return NextResponse.json({
    me: {
      id: me.id,
      name: profile?.name ?? '',
      emoji: profile?.avatar_emoji ?? '',
      streak: profile?.current_streak ?? 0,
      xp: profile?.xp_total ?? 0,
    },
    date,
    nowMinutes: zonedParts(now).minutes,
    tasks: shaped,
    rewards: mine.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      unlocked: privilegeUnlocked(r, shaped),
      request: (requests ?? []).filter((q) => q.privilege_id === r.id && todayInTz(new Date(q.created_at)) === date).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
    })),
  })
}

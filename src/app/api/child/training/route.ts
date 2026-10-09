import { NextRequest, NextResponse } from 'next/server'
import { bad, requireChild } from '@/lib/api-auth'
import { addDays, todayInTz } from '@/lib/dates'
import { TRAINING_XP, cleanTraining, winPromptFor } from '@/lib/training'

export const dynamic = 'force-dynamic'

/** Monday of the week containing this date (YYYY-MM-DD). */
function weekStart(date: string) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

// Today's log, plus how many days he trained this week and his last few wins.
export async function GET() {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const day = todayInTz()

  const { data: recent } = await admin
    .from('training_logs')
    .select('day, rest_day, skills, worked_on, win_prompt, win')
    .eq('profile_id', me.id)
    .gte('day', addDays(day, -30))
    .order('day', { ascending: false })

  const rows = recent ?? []
  const today = rows.find((r) => r.day === day) ?? null
  const monday = weekStart(day)
  return NextResponse.json({
    day,
    xp: TRAINING_XP,
    winPrompt: today?.win_prompt ?? winPromptFor(day),
    today,
    trainedThisWeek: rows.filter((r) => r.day >= monday && !r.rest_day).length,
    recentWins: rows.filter((r) => r.day !== day && r.win && !r.rest_day).slice(0, 3).map((r) => ({ day: r.day, win: r.win })),
  })
}

// Save or edit today's log. Points are paid once a day.
export async function POST(req: NextRequest) {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  const { values, error } = cleanTraining(body)
  if (error || !values) return bad(error ?? 'Check your log.')

  const day = todayInTz()
  const { data: existing } = await admin.from('training_logs').select('id').eq('profile_id', me.id).eq('day', day).maybeSingle()
  if (existing) {
    const { error: upErr } = await admin
      .from('training_logs')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (upErr) return bad('That did not save. Try again.', 500)
    return NextResponse.json({ ok: true, xp: 0 })
  }

  const { error: insErr } = await admin
    .from('training_logs')
    .insert({ ...values, family_id: me.family_id, profile_id: me.id, day, win_prompt: winPromptFor(day) })
  if (insErr) {
    if (insErr.code === '23505') return NextResponse.json({ ok: true, xp: 0 })
    return bad('That did not save. Try again.', 500)
  }
  const { error: xpErr } = await admin.rpc('award_xp', { p_child: me.id, p_family: me.family_id, p_xp: TRAINING_XP })
  if (xpErr) console.error('award_xp (training) failed:', xpErr.message)
  return NextResponse.json({ ok: true, xp: TRAINING_XP })
}

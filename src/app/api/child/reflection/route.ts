import { NextRequest, NextResponse } from 'next/server'
import { bad, requireChild } from '@/lib/api-auth'
import { todayInTz } from '@/lib/dates'
import { REFLECTION_XP, cleanAnswer, questionFor } from '@/lib/reflection'

export const dynamic = 'force-dynamic'

// Today's question and Grey's answer (if any).
export async function GET() {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const day = todayInTz()
  const { data } = await admin.from('reflections').select('question, answer').eq('profile_id', me.id).eq('day', day).maybeSingle()
  return NextResponse.json({
    day,
    question: data?.question ?? questionFor(day),
    answer: data?.answer ?? null,
    xp: REFLECTION_XP,
  })
}

// Save (or edit) today's answer. Points are paid once, on the first answer.
export async function POST(req: NextRequest) {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  const { answer, error } = cleanAnswer(body.answer)
  if (error || !answer) return bad(error ?? 'Write an answer.')

  const day = todayInTz()
  const { data: existing } = await admin.from('reflections').select('id').eq('profile_id', me.id).eq('day', day).maybeSingle()

  if (existing) {
    const { error: upErr } = await admin.from('reflections').update({ answer, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (upErr) return bad('That did not save. Try again.', 500)
    return NextResponse.json({ ok: true, answer, xp: 0 })
  }

  const { error: insErr } = await admin
    .from('reflections')
    .insert({ family_id: me.family_id, profile_id: me.id, day, question: questionFor(day), answer })
  if (insErr) {
    // A double tap races the unique (profile_id, day) key: treat as saved, no second payout.
    if (insErr.code === '23505') return NextResponse.json({ ok: true, answer, xp: 0 })
    return bad('That did not save. Try again.', 500)
  }

  const { error: xpErr } = await admin.rpc('award_xp', { p_child: me.id, p_family: me.family_id, p_xp: REFLECTION_XP })
  if (xpErr) console.error('award_xp (reflection) failed:', xpErr.message)
  return NextResponse.json({ ok: true, answer, xp: REFLECTION_XP })
}

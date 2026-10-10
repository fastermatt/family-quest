import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { addDays, todayInTz } from '@/lib/dates'
import { streaks, summarizePeriod } from '@/lib/history'
import { buildDays, loadHistoryRows } from '@/lib/history-data'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 90

// Per child: one summary per day for the last N days, 7- and 30-day roll-ups, streaks.
export async function GET(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth

  const raw = Number(new URL(req.url).searchParams.get('days') ?? 30)
  const n = Number.isFinite(raw) ? Math.min(MAX_DAYS, Math.max(1, Math.floor(raw))) : 30
  const today = todayInTz()

  const { data: kids, error } = await admin
    .from('profiles')
    .select('id, name, avatar_emoji')
    .eq('family_id', me.family_id)
    .eq('role', 'child')
    .order('name')
  if (error) return bad('Could not load the family.', 500)

  // Streaks and the 30-day roll-up need at least 30 days even if the list is shorter.
  const loadFrom = addDays(today, -(Math.max(n, 30) - 1))
  let rows
  try {
    rows = await loadHistoryRows(admin, (kids ?? []).map((k) => k.id), loadFrom, today)
  } catch {
    return bad('Could not load history.', 500)
  }

  const children = (kids ?? []).map((k) => {
    const all = buildDays(rows.filter((r) => r.childId === k.id), loadFrom, today)
    const days = all.slice(-n)
    const { current, best } = streaks(all, today)
    return {
      id: k.id,
      name: k.name,
      emoji: k.avatar_emoji,
      days,
      summary: {
        week: summarizePeriod(all.slice(-7), today),
        month: summarizePeriod(all.slice(-30), today),
      },
      currentStreak: current,
      bestStreak: best,
    }
  })

  return NextResponse.json({ today, days: n, children })
}

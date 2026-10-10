import { NextResponse } from 'next/server'
import { bad, requireChild } from '@/lib/api-auth'
import { addDays, todayInTz } from '@/lib/dates'
import { dayLook } from '@/lib/history'
import { buildDays, loadHistoryRows } from '@/lib/history-data'

export const dynamic = 'force-dynamic'

// Grey's last seven days, today last: one small summary per day for the week strip.
export async function GET() {
  const auth = await requireChild()
  if (auth.error) return auth.error
  const { me, admin } = auth

  const today = todayInTz()
  const from = addDays(today, -6)
  let rows
  try {
    rows = await loadHistoryRows(admin, [me.id], from, today)
  } catch {
    return bad('Could not load your week.', 500)
  }

  const days = buildDays(rows, from, today).map((d) => ({
    date: d.date,
    total: d.total,
    done: d.done,
    missed: d.missed,
    pct: d.pct,
    look: dayLook(d, d.date === today),
  }))

  return NextResponse.json({
    today,
    days,
    perfectDays: days.filter((d) => d.look === 'perfect').length,
  })
}

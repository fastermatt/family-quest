import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { buildSummaries, sendSummaryEmail, summaryHtml } from '@/lib/summary'

export const dynamic = 'force-dynamic'

// Vercel Cron, each evening: email parents what got done and what didn't.
// `?preview=1` returns the HTML instead of sending (still needs the secret).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const summaries = await buildSummaries(adminClient())

  if (request.nextUrl.searchParams.get('preview')) {
    const html = summaries.map((s) => summaryHtml(s, appUrl)).join('<hr>') || '<p>No families with chores and a parent email today.</p>'
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const results = []
  for (const s of summaries) {
    const r = await sendSummaryEmail(s, appUrl)
    if (!r.ok) console.error(`summary for ${s.familyName} not sent:`, r.error)
    results.push({ family: s.familyName, recipients: s.recipients.length, ...r })
  }
  return NextResponse.json({ success: results.every((r) => r.ok), results })
}

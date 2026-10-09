import { NextRequest, NextResponse } from 'next/server'
import { adminClient, getSessionProfile } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Anyone on a ChoreZap screen can report a problem, signed in or not
// (sign-in itself can be the problem). Reports land in problem_reports.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
  if (!message) return NextResponse.json({ error: 'Say what went wrong.' }, { status: 400 })

  const me = await getSessionProfile().catch(() => null)
  const errors = Array.isArray(body.recentErrors)
    ? body.recentErrors.slice(-5).map((e: unknown) => String(e).slice(0, 500))
    : []

  const { error } = await adminClient()
    .from('problem_reports')
    .insert({
      message,
      page: typeof body.page === 'string' ? body.page.slice(0, 300) : null,
      recent_errors: errors,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
      app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      family_id: me?.family_id ?? null,
      profile_id: me?.id ?? null,
      role: me?.role ?? null,
    })
  if (error) {
    console.error('report-problem insert failed:', error.message)
    return NextResponse.json({ error: 'Could not send the report. Try again in a minute.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

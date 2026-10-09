import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// PIN sessions live in a cookie, so signing out has to clear it here.
export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut().catch(() => {})
  const res = NextResponse.json({ ok: true })
  for (const name of ['profile_token', 'active_profile_id']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 })
  }
  return res
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/session'

export const dynamic = 'force-dynamic'

// PIN sessions live in a cookie, so signing out has to clear it here.
export async function POST() {
  // Remember the family so the sign-in screen can show everyone's names next time.
  const me = await getSessionProfile().catch(() => null)
  const supabase = await createClient()
  await supabase.auth.signOut().catch(() => {})
  const res = NextResponse.json({ ok: true, familyId: me?.family_id ?? null })
  for (const name of ['profile_token', 'active_profile_id']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 })
  }
  return res
}

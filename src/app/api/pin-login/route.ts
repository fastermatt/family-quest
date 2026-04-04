import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'

const MAX_ATTEMPTS = 5          // max failed attempts
const WINDOW_MINUTES = 15       // within this window
const LOCKOUT_SECONDS = 900     // 15 min lockout

export async function POST(req: NextRequest) {
  const { profileId, pin } = await req.json()

  if (!profileId || !pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Brute-force check ───────────────────────────────────────────────────────
  await supabase.rpc('cleanup_old_pin_attempts') // clean stale records

  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count: recentFailures } = await supabase
    .from('pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('success', false)
    .gte('attempted_at', windowStart)

  if ((recentFailures ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    )
  }

  // ── Fetch profile (never return pin_hash to client) ─────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, access_token, pin_hash, family_id')
    .eq('id', profileId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (!profile.pin_hash) {
    return NextResponse.json({ error: 'No PIN set for this profile. Ask a parent to set one.' }, { status: 401 })
  }

  // ── Validate PIN ────────────────────────────────────────────────────────────
  const valid = await bcrypt.compare(pin, profile.pin_hash)

  // Record attempt (success or failure)
  await supabase.from('pin_attempts').insert({
    profile_id: profileId,
    success: valid,
  })

  if (!valid) {
    const remaining = MAX_ATTEMPTS - ((recentFailures ?? 0) + 1)
    return NextResponse.json(
      { error: remaining > 0 ? `Wrong PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} left.` : 'Too many attempts. Try again in 15 minutes.' },
      { status: 401 }
    )
  }

  // ── Success — set 1-year session cookie ────────────────────────────────────
  const response = NextResponse.json({ ok: true, role: profile.role })
  response.cookies.set('profile_token', profile.access_token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}

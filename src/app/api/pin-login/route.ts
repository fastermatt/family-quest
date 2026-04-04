import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { profileId, pin } = await req.json()

  if (!profileId || !pin || pin.length !== 4) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, access_token, pin_hash')
    .eq('id', profileId)
    .single()

  if (!profile || !profile.pin_hash) {
    return NextResponse.json({ error: 'No PIN set for this profile' }, { status: 401 })
  }

  const valid = await bcrypt.compare(pin, profile.pin_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  }

  // Set the profile_token cookie (same as before — all downstream auth uses this)
  const response = NextResponse.json({ ok: true, role: profile.role })
  response.cookies.set('profile_token', profile.access_token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year — they stay logged in
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}

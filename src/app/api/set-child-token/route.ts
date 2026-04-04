import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 400 })
  }

  // Validate the token is real
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('access_token', token)
    .single()

  if (!profile || profile.role !== 'child') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set('profile_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })

  return NextResponse.json({ ok: true })
}

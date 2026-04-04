import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Allows a PARENT to impersonate a child for viewing purposes.
// Critical: verifies caller is a parent AND target child is in same family.
export async function POST(req: NextRequest) {
  const { profileId, clearAll } = await req.json()

  const cookieStore = await cookies()
  const callerToken = cookieStore.get('profile_token')?.value

  const response = NextResponse.json({ success: true })

  // Clear all — just wipe cookies
  if (clearAll) {
    response.cookies.delete('profile_token')
    response.cookies.delete('active_profile_id')
    return response
  }

  // Switching to a child profile — MUST verify caller is a parent in same family
  if (!callerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify caller
  const { data: caller } = await supabase
    .from('profiles')
    .select('role, family_id')
    .eq('access_token', callerToken)
    .single()

  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Clearing child view (profileId is null/falsy) — allow any authenticated user
  if (!profileId) {
    response.cookies.delete('active_profile_id')
    return response
  }

  // Switching TO a child — must be a parent
  if (caller.role !== 'parent') {
    return NextResponse.json({ error: 'Only parents can switch profiles' }, { status: 403 })
  }

  // Target child must be in same family
  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, family_id')
    .eq('id', profileId)
    .eq('family_id', caller.family_id)
    .eq('role', 'child')
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Child not found in your family' }, { status: 404 })
  }

  response.cookies.set('active_profile_id', profileId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}

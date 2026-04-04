import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve base session first (profile_token or Supabase auth)
  let sessionProfile: { id: string; role: string; family_id: string } | null = null
  const profileToken = cookieStore.get('profile_token')?.value

  if (profileToken) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, role, family_id')
      .eq('access_token', profileToken)
      .single()
    sessionProfile = data
  }

  if (!sessionProfile) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, role, family_id')
        .eq('auth_user_id', user.id)
        .single()
      sessionProfile = data
    }
  }

  if (!sessionProfile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // If a parent is viewing as a child, verify child is in the same family
  const activeProfileId = cookieStore.get('active_profile_id')?.value
  if (activeProfileId && sessionProfile.role === 'parent') {
    const { data: childProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', activeProfileId)
      .eq('family_id', sessionProfile.family_id) // same family check
      .eq('role', 'child')
      .single()
    if (childProfile) return NextResponse.json(childProfile)
  }

  // Return the session profile's full data
  const { data: fullProfile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', sessionProfile.id)
    .single()

  if (!fullProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Strip pin_hash before returning
  const { pin_hash, ...safe } = fullProfile
  return NextResponse.json(safe)
}

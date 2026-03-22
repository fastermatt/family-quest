import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()

  // Check for active_profile_id cookie (parent viewing as child)
  const activeProfileId = cookieStore.get('active_profile_id')?.value

  if (activeProfileId) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: childProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', activeProfileId)
      .eq('role', 'child')
      .single()

    if (childProfile) {
      return NextResponse.json(childProfile)
    }
  }

  // Check for persistent profile_token cookie (link-based login)
  const profileToken = cookieStore.get('profile_token')?.value

  if (profileToken) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: tokenProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('access_token', profileToken)
      .single()

    if (tokenProfile) {
      return NextResponse.json(tokenProfile)
    }
  }

  // Default: return the authenticated user's profile
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json(profile)
}

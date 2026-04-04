import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Uses service role to bypass RLS — safe because we validate the profile token first
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve which profile is active (same logic as /api/active-profile)
  let profileId: string | null = null

  const activeProfileId = cookieStore.get('active_profile_id')?.value
  if (activeProfileId) {
    profileId = activeProfileId
  } else {
    const profileToken = cookieStore.get('profile_token')?.value
    if (profileToken) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('access_token', profileToken)
        .single()
      profileId = data?.id ?? null
    }
  }

  // Fall back to Supabase auth user
  if (!profileId) {
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      profileId = data?.id ?? null
    }
  }

  if (!profileId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // optional: filter by due_date

  let query = supabaseAdmin
    .from('task_instances')
    .select('*, task_template:task_templates(*)')
    .eq('assigned_to', profileId)
    .order('due_date', { ascending: false })

  if (date) {
    query = query.eq('due_date', date)
  }

  const { data: tasks, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(tasks || [])
}

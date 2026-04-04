import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Resolves the active profile and verifies it belongs to the caller's family.
// Uses service role to bypass RLS (PIN-auth users have no auth.uid()),
// but strictly scopes queries to the resolved profile only.
async function resolveProfileId(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<{ profileId: string; familyId: string } | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const profileToken = cookieStore.get('profile_token')?.value
  const activeProfileId = cookieStore.get('active_profile_id')?.value

  // Base session: resolve from profile_token
  let sessionProfile: { id: string; role: string; family_id: string } | null = null

  if (profileToken) {
    const { data } = await supabase
      .from('profiles')
      .select('id, role, family_id')
      .eq('access_token', profileToken)
      .single()
    sessionProfile = data
  }

  if (!sessionProfile) {
    // Fall back to Supabase auth
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('id, role, family_id')
        .eq('auth_user_id', user.id)
        .single()
      sessionProfile = data
    }
  }

  if (!sessionProfile) return null

  // If parent is viewing as a child, verify that child is in same family
  if (activeProfileId && sessionProfile.role === 'parent') {
    const { data: child } = await supabase
      .from('profiles')
      .select('id, family_id')
      .eq('id', activeProfileId)
      .eq('family_id', sessionProfile.family_id) // MUST be same family
      .single()
    if (child) return { profileId: child.id, familyId: child.family_id }
  }

  return { profileId: sessionProfile.id, familyId: sessionProfile.family_id }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const resolved = await resolveProfileId(cookieStore)

  if (!resolved) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { profileId } = resolved
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')

  let query = supabase
    .from('task_instances')
    .select('*, task_template:task_templates(*)')
    .eq('assigned_to', profileId) // always scoped to resolved profile
    .order('due_date', { ascending: false })

  if (date) query = query.eq('due_date', date)

  const { data: tasks, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(tasks || [])
}

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export interface SessionProfile {
  id: string
  role: 'parent' | 'child'
  family_id: string
}

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Who is calling? A PIN/link profile token first, then a parent's login. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const admin = adminClient()
  const cookieStore = await cookies()

  const token = cookieStore.get('profile_token')?.value
  if (token) {
    const { data } = await admin
      .from('profiles')
      .select('id, role, family_id')
      .eq('access_token', token)
      .single()
    if (data) return data as SessionProfile
  }

  const authClient = await createServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return null

  const { data } = await admin
    .from('profiles')
    .select('id, role, family_id')
    .eq('auth_user_id', user.id)
    .single()
  return (data as SessionProfile) ?? null
}

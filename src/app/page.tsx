import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function Home() {
  const cookieStore = await cookies()
  const profileToken = cookieStore.get('profile_token')?.value

  // If they have a profile_token cookie, resolve it and route them directly
  if (profileToken) {
    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('access_token', profileToken)
      .single()

    if (profile) {
      redirect(profile.role === 'child' ? '/home' : '/dashboard')
    }
  }

  // Check Supabase auth session (for parents who logged in via magic link originally)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    if (profile) {
      redirect(profile.role === 'child' ? '/home' : '/dashboard')
    }
  }

  // No session — show the family login screen
  redirect('/family-login')
}

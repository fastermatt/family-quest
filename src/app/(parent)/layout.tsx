import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ParentNav } from '@/components/parent-nav'

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const cookieStore = await cookies()

  const { data: { user } } = await supabase.auth.getUser()

  let profile = null

  if (user) {
    // Normal Supabase auth path
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()
    profile = data
  } else {
    // Token-based auth path (link login)
    const profileToken = cookieStore.get('profile_token')?.value
    if (profileToken) {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('access_token', profileToken)
        .single()
      profile = data
    }
  }

  // No profile yet — new user, send to setup
  if (!profile) {
    redirect('/family/setup')
  }

  // Wrong role — send children to their view
  if (profile.role !== 'parent') {
    redirect('/home')
  }

  if (!profile.family_id) {
    redirect('/family/setup')
  }

  return (
    <>
      <ParentNav />
      <div className="max-w-6xl mx-auto px-4 py-6 pb-8">
        {children}
      </div>
    </>
  )
}

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ParentNav } from '@/components/parent-nav'
import { ReportProblem } from '@/components/report-problem'

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const cookieStore = await cookies()

  // Same order as every API route (src/lib/session.ts): PIN cookie first,
  // then an email login. Two different orders meant two different people.
  let profile = null
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
  if (!profile) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', user.id)
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
      <div className="mx-auto max-w-2xl px-4 py-6" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        {children}
        <div className="mt-12 flex justify-center">
          <ReportProblem />
        </div>
      </div>
    </>
  )
}

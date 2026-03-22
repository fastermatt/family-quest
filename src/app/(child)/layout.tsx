import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { BottomNav } from '@/components/bottom-nav'
import { ChildViewBanner } from '@/components/child-view-banner'

export default async function ChildLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const cookieStore = await cookies()

  const activeProfileId = cookieStore.get('active_profile_id')?.value
  const profileToken = cookieStore.get('profile_token')?.value

  const { data: { user } } = await supabase.auth.getUser()

  // Allow parent to view child pages via the active_profile_id cookie
  if (activeProfileId) {
    const { data: childProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeProfileId)
      .eq('role', 'child')
      .single()

    if (childProfile) {
      return (
        <>
          <ChildViewBanner childName={childProfile.name} childEmoji={childProfile.avatar_emoji} />
          <div className="max-w-md mx-auto px-4 py-6 pb-24 pt-20">
            {children}
          </div>
          <BottomNav />
        </>
      )
    }
  }

  // Token-based auth path (link login for children)
  if (!user && profileToken) {
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: tokenProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('access_token', profileToken)
      .eq('role', 'child')
      .single()

    if (tokenProfile) {
      return (
        <>
          <div className="max-w-md mx-auto px-4 py-6 pb-24">
            {children}
          </div>
          <BottomNav />
        </>
      )
    }
    // Token was for a parent — redirect to dashboard
    redirect('/dashboard')
  }

  if (!user) {
    redirect('/login')
  }

  // Normal child login path (child has their own auth account)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || profile.role !== 'child') {
    redirect('/dashboard')
  }

  return (
    <>
      <div className="max-w-md mx-auto px-4 py-6 pb-24">
        {children}
      </div>
      <BottomNav />
    </>
  )
}

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { BottomNav } from '@/components/bottom-nav'
import { ChildViewBanner } from '@/components/child-view-banner'
import Image from 'next/image'

function ChildHeader() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center px-4 bg-[#020617]/80 backdrop-blur-md border-b border-white/10"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(56px + env(safe-area-inset-top, 0px))' }}
    >
      <Image src="/logo.svg" alt="Home Base" width={120} height={32} priority />
    </header>
  )
}

const HEADER_OFFSET = 'calc(56px + env(safe-area-inset-top, 0px))'

export default async function ChildLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const cookieStore = await cookies()

  const activeProfileId = cookieStore.get('active_profile_id')?.value
  const profileToken = cookieStore.get('profile_token')?.value

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Allow parent to view child pages via the active_profile_id cookie (highest priority)
  if (activeProfileId) {
    const { data: childProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', activeProfileId)
      .eq('role', 'child')
      .single()

    if (childProfile) {
      return (
        <>
          <ChildHeader />
          <ChildViewBanner childName={childProfile.name} childEmoji={childProfile.avatar_emoji} />
          <div
            className="max-w-md mx-auto px-4 py-6"
            style={{ paddingTop: HEADER_OFFSET, paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
          >
            {children}
          </div>
          <BottomNav />
        </>
      )
    }
  }

  // 2. Token-based auth (link login) — checked before Supabase auth so a child's
  //    link always works even on a shared device where a parent is also logged in
  if (profileToken) {
    const { data: tokenProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('access_token', profileToken)
      .single()

    if (tokenProfile?.role === 'child') {
      return (
        <>
          <ChildHeader />
          <div
            className="max-w-md mx-auto px-4 py-6"
            style={{ paddingTop: HEADER_OFFSET, paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
          >
            {children}
          </div>
          <BottomNav />
        </>
      )
    }

    if (tokenProfile?.role === 'parent') {
      redirect('/dashboard')
    }
  }

  // 3. Normal Supabase auth path
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

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
      <ChildHeader />
      <div
        className="max-w-md mx-auto px-4 py-6"
        style={{ paddingTop: HEADER_OFFSET, paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
      <BottomNav />
    </>
  )
}

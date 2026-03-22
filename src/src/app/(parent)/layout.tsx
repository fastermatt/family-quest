import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ParentNav } from '@/components/parent-nav'

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || profile.role !== 'parent') {
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

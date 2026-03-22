import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'

export default async function ChildLayout({
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

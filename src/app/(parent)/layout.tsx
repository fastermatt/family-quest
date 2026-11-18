import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/session'
import { ParentNav } from '@/components/parent-nav'
import { ReportProblem } from '@/components/report-problem'

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Same order as every API route: PIN cookie first, then an email login.
  // Shared, per-request lookup (src/lib/session.ts).
  const profile = await getSessionProfile()

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

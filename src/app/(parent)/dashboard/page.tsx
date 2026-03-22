import { createClient } from '@/lib/supabase/server'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import Link from 'next/link'
import { getLevelInfo } from '@/lib/utils'
import { ViewAsChildButton } from '@/components/view-as-child-button'
import { GenerateTasksButton } from '@/components/generate-tasks-button'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) return null

  const { data: family } = await supabase
    .from('families')
    .select('*')
    .eq('id', profile.family_id)
    .single()

  const { data: children } = await supabase
    .from('profiles')
    .select('*')
    .eq('family_id', profile.family_id)
    .eq('role', 'child')

  // Get today's date
  const today = new Date().toISOString().split('T')[0]

  const { data: todayTasks } = await supabase
    .from('task_instances')
    .select('*')
    .eq('due_date', today)
    .in(
      'assigned_to',
      children?.map((c) => c.id) || []
    )

  const { data: pendingReviews } = await supabase
    .from('task_instances')
    .select('*')
    .eq('status', 'submitted')
    .in(
      'assigned_to',
      children?.map((c) => c.id) || []
    )

  const { data: pendingRequests } = await supabase
    .from('privilege_requests')
    .select('*')
    .eq('status', 'pending')

  const familyLevelInfo = getLevelInfo(family?.family_xp || 0)

  const childStats = children?.map((child) => {
    const childTasks = todayTasks?.filter((t) => t.assigned_to === child.id) || []
    const completed = childTasks.filter((t) =>
      ['approved', 'submitted'].includes(t.status)
    ).length

    return {
      ...child,
      todayCompleted: completed,
      todayTotal: childTasks.length,
    }
  })

  return (
    <div className="space-y-8">
      {/* Family Header */}
      <div className="glass-card p-6">
        <h1 className="text-3xl font-bold mb-2">{family?.name || 'Your Family'}</h1>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60">Family Level</span>
              <Badge variant="level">Level {family?.family_level || 1}</Badge>
            </div>
            <ProgressBar
              value={family?.family_xp || 0}
              max={(family?.family_level || 1) * 5000}
            />
            <p className="text-sm text-white/50 mt-1">
              {family?.family_xp || 0} / {((family?.family_level || 1) * 5000).toLocaleString()} XP
            </p>
          </div>
        </div>
      </div>

      {/* Generate Tasks */}
      <div className="glass-card p-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Daily Tasks</h2>
          <p className="text-sm text-white/60">Generate today&apos;s tasks for all children</p>
        </div>
        <GenerateTasksButton />
      </div>

      {/* Children Overview */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Family Members</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {childStats?.map((child) => {
            const childLevelInfo = getLevelInfo(child.xp_total)
            return (
              <GlassCard key={child.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-3xl mb-2">{child.avatar_emoji}</div>
                    <h3 className="text-lg font-bold">{child.name}</h3>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <Badge variant="xp">{child.xp_total} XP</Badge>
                    <ViewAsChildButton childId={child.id} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-white/60 mb-1">
                      Level: <span className="text-white">{childLevelInfo.currentLevel.name}</span>
                    </p>
                    <ProgressBar
                      value={child.xp_total - childLevelInfo.currentLevel.xpRequired}
                      max={
                        childLevelInfo.nextLevel.xpRequired -
                        childLevelInfo.currentLevel.xpRequired
                      }
                      className="h-1.5"
                    />
                  </div>

                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-white/60">Today&apos;s Tasks</p>
                      <p className="text-lg font-bold text-teal-400">
                        {child.todayCompleted}/{child.todayTotal}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/60">Streak</p>
                      <p className="text-lg font-bold text-orange-400">
                        🔥 {child.current_streak}
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      </div>

      {/* Pending Reviews */}
      {(pendingReviews?.length || 0) > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Pending Reviews</h2>
            <Badge variant="pending">
              {pendingReviews?.length}
            </Badge>
          </div>
          <p className="text-white/60 mb-4">
            {pendingReviews?.length} task{
              (pendingReviews?.length || 0) !== 1 ? 's' : ''
            } waiting for approval
          </p>
          <Link
            href="/review"
            className="inline-block px-6 py-2 rounded-2xl bg-teal-600/30 text-teal-300 border border-teal-400/50 hover:bg-teal-600/50 transition-all font-medium"
          >
            Review All
          </Link>
        </div>
      )}

      {/* Pending Requests */}
      {(pendingRequests?.length || 0) > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Pending Requests</h2>
            <Badge variant="pending">
              {pendingRequests?.length}
            </Badge>
          </div>
          <p className="text-white/60 mb-4">
            {pendingRequests?.length} privilege request{
              (pendingRequests?.length || 0) !== 1 ? 's' : ''
            } pending
          </p>
          <Link
            href="/review"
            className="inline-block px-6 py-2 rounded-2xl bg-teal-600/30 text-teal-300 border border-teal-400/50 hover:bg-teal-600/50 transition-all font-medium"
          >
            Review All
          </Link>
        </div>
      )}
    </div>
  )
}

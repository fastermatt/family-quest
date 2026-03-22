'use client'

import { createClient } from '@/lib/supabase/client'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

export default function QuestsPage() {
  const supabase = createClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/active-profile')
      if (!res.ok) return null
      return res.json()
    },
  })

  const today = new Date().toISOString().split('T')[0]

  const { data: allTasks } = useQuery({
    queryKey: ['allTasks', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data: tasks } = await supabase
        .from('task_instances')
        .select('*')
        .eq('assigned_to', profile.id)
        .order('due_date', { ascending: false })

      const { data: templates } = await supabase
        .from('task_templates')
        .select('*')

      return (tasks || []).map((task) => ({
        ...task,
        task_template: templates?.find((t) => t.id === task.template_id),
      }))
    },
    enabled: !!profile?.id,
  })

  const todayTasks = allTasks?.filter((t) => t.due_date === today) || []
  const completedTasks = allTasks?.filter((t) =>
    ['approved', 'submitted'].includes(t.status)
  ) || []

  const upcoming = allTasks?.filter((t) => t.due_date > today) || []

  const stats = {
    total: allTasks?.length || 0,
    completed: completedTasks.length,
    pending: todayTasks.filter((t) => t.status === 'pending').length,
    streak: profile?.current_streak || 0,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your Quests</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold text-teal-400">{stats.completed}</p>
          <p className="text-xs text-white/60">Completed</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">🔥 {stats.streak}</p>
          <p className="text-xs text-white/60">Current Streak</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          <p className="text-xs text-white/60">Today's Tasks</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-white/60">Total Quests</p>
        </GlassCard>
      </div>

      {/* Today's Tasks */}
      {todayTasks.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Today's Quests</h2>
          <div className="space-y-2">
            {todayTasks.map((task) => (
              <GlassCard
                key={task.id}
                className={`p-4 ${
                  ['approved', 'submitted'].includes(task.status)
                    ? 'border-green-400/50 bg-green-500/5'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold">{task.task_template?.name}</p>
                    <p className="text-xs text-white/50 mt-1">
                      {task.task_template?.category}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="xp">
                      {task.task_template?.xp_value} XP
                    </Badge>
                    <Badge
                      variant={
                        task.status === 'approved'
                          ? 'approved'
                          : task.status === 'submitted'
                          ? 'submitted'
                          : task.status === 'rejected'
                          ? 'rejected'
                          : 'pending'
                      }
                    >
                      {task.status}
                    </Badge>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
          <Link href="/home" className="mt-4 inline-block">
            <button className="px-4 py-2 rounded-lg bg-teal-600/30 text-teal-300 border border-teal-400/50 hover:bg-teal-600/50 transition-all font-medium text-sm">
              Back to Home
            </button>
          </Link>
        </div>
      )}

      {/* Upcoming Tasks */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Upcoming Quests</h2>
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((task) => (
              <GlassCard key={task.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold">{task.task_template?.name}</p>
                    <p className="text-xs text-white/50 mt-1">
                      {new Date(task.due_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="xp">
                    {task.task_template?.xp_value} XP
                  </Badge>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {!todayTasks.length && !upcoming.length && (
        <GlassCard className="p-8 text-center">
          <p className="text-white/60">No quests assigned yet</p>
        </GlassCard>
      )}
    </div>
  )
}

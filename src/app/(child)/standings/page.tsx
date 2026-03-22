'use client'

import { createClient } from '@/lib/supabase/client'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@tanstack/react-query'

export default function StandingsPage() {
  const supabase = createClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/active-profile')
      if (!res.ok) return null
      return res.json()
    },
  })

  const { data: siblings } = useQuery({
    queryKey: ['siblings', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('role', 'child')
        .order('xp_total', { ascending: false })
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const { data: weeklyStandings } = useQuery({
    queryKey: ['weeklyStandings', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('weekly_standings')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('xp_earned', { ascending: false })
        .limit(10)
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Family Standings</h1>

      {/* Overall Rankings */}
      <div>
        <h2 className="text-lg font-bold mb-3">All-Time Rankings</h2>
        <div className="space-y-2">
          {siblings?.map((sibling, index) => {
            const isMe = sibling.id === profile?.id
            const medals = ['🥇', '🥈', '🥉']
            const medal = medals[index] || `${index + 1}.`

            return (
              <GlassCard
                key={sibling.id}
                className={`p-4 flex items-center justify-between ${
                  isMe ? 'border-teal-400/50 bg-teal-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-2xl">{medal}</span>
                  <span className="text-3xl">{sibling.avatar_emoji}</span>
                  <div>
                    <p className="font-semibold">
                      {sibling.name} {isMe && '(you)'}
                    </p>
                    <p className="text-xs text-white/50">
                      Longest Streak: 🔥 {sibling.longest_streak} days
                    </p>
                  </div>
                </div>
                <Badge variant="xp">{sibling.xp_total} XP</Badge>
              </GlassCard>
            )
          })}
        </div>
      </div>

      {/* This Week's Stats */}
      <div>
        <h2 className="text-lg font-bold mb-3">This Week's Highlights</h2>
        <div className="space-y-2">
          {weeklyStandings?.slice(0, 3).map((standing, index) => {
            const child = siblings?.find((s) => s.id === standing.profile_id)
            const medals = ['🥇', '🥈', '🥉']

            return (
              <GlassCard key={standing.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{medals[index] || '•'}</span>
                    <span className="text-2xl">{child?.avatar_emoji}</span>
                    <p className="font-semibold">{child?.name}</p>
                  </div>
                  <Badge variant="level">+{standing.xp_earned} XP</Badge>
                </div>
                <div className="text-xs text-white/50 space-y-0.5">
                  <p>Tasks Done: {standing.tasks_completed}</p>
                  <p>Bonus Tasks: {standing.bonus_tasks_completed}</p>
                  <p>Peak Streak: 🔥 {standing.streak_peak}</p>
                </div>
              </GlassCard>
            )
          })}
        </div>
      </div>

      {/* Achievements */}
      <div>
        <h2 className="text-lg font-bold mb-3">Titles</h2>
        <div className="grid grid-cols-2 gap-2">
          <GlassCard className="p-4 text-center">
            <p className="text-2xl mb-1">🌟</p>
            <p className="text-xs font-medium">Week Champion</p>
            <p className="text-xs text-white/40 mt-1">Highest XP</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <p className="text-2xl mb-1">🔥</p>
            <p className="text-xs font-medium">Streak King</p>
            <p className="text-xs text-white/40 mt-1">Longest Streak</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <p className="text-2xl mb-1">🎯</p>
            <p className="text-xs font-medium">Bounty Hunter</p>
            <p className="text-xs text-white/40 mt-1">Most Bonuses</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <p className="text-2xl mb-1">📈</p>
            <p className="text-xs font-medium">Most Improved</p>
            <p className="text-xs text-white/40 mt-1">Biggest Gain</p>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}

'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { getLevelInfo } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const ACHIEVEMENTS = [
  { icon: '🌟', name: 'First Step', xpRequired: 0 },
  { icon: '🎯', name: 'On Fire', xpRequired: 500 },
  { icon: '🏆', name: 'Champion', xpRequired: 2000 },
  { icon: '👑', name: 'Legend', xpRequired: 5000 },
  { icon: '💪', name: 'Unstoppable', xpRequired: 10000 },
]

export default function RewardsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', data.user?.id)
        .single()
      return p
    },
  })

  const { data: privileges } = useQuery({
    queryKey: ['privileges', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('privileges')
        .select('*')
        .eq('family_id', profile.family_id)
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const { data: privilegeRequests } = useQuery({
    queryKey: ['privilegeRequests', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data } = await supabase
        .from('privilege_requests')
        .select('*,privilege:privileges(*)')
        .eq('requested_by', profile.id)
        .in('status', ['pending', 'approved', 'denied', 'conditional'])
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!profile?.id,
  })

  const { data: bonusTasks } = useQuery({
    queryKey: ['bonusTasks', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('bonus_tasks')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('status', 'active')
        .or(
          `assigned_to.is.null,assigned_to.eq.${profile.id}`
        )
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!profile?.family_id && !!profile?.id,
  })

  const requestPrivilegeMutation = useMutation({
    mutationFn: async (privilegeId: string) => {
      if (!profile?.id) throw new Error('No profile')

      await supabase.from('privilege_requests').insert([
        {
          privilege_id: privilegeId,
          requested_by: profile.id,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privilegeRequests'] })
    },
  })

  const claimBonusMutation = useMutation({
    mutationFn: async (bonusId: string) => {
      if (!profile?.id) throw new Error('No profile')

      await supabase
        .from('bonus_tasks')
        .update({ claimed_by: profile.id, status: 'claimed' })
        .eq('id', bonusId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonusTasks'] })
    },
  })

  const levelInfo = getLevelInfo(profile?.xp_total || 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your Rewards</h1>

      {/* XP Display */}
      <GlassCard className="p-6 text-center">
        <p className="text-white/60 text-sm mb-1">Total XP</p>
        <p className="text-5xl font-bold gradient-text mb-4">
          {profile?.xp_total || 0}
        </p>
        <Badge variant="level" className="mx-auto">
          {levelInfo.currentLevel.name}
        </Badge>
      </GlassCard>

      {/* Level Progress */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/60 text-sm">
            {levelInfo.currentLevel.name}
          </span>
          <span className="text-teal-400 text-sm">
            {Math.round(levelInfo.progress)}%
          </span>
        </div>
        <ProgressBar
          value={profile?.xp_total || 0}
          max={levelInfo.nextLevel.xpRequired}
        />
        <p className="text-xs text-white/40 mt-2">
          {levelInfo.nextLevel.xpRequired - (profile?.xp_total || 0)} XP to {levelInfo.nextLevel.name}
        </p>
      </GlassCard>

      {/* Achievements */}
      <div>
        <h2 className="text-lg font-bold mb-3">Achievements</h2>
        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = (profile?.xp_total || 0) >= achievement.xpRequired
            return (
              <GlassCard
                key={achievement.name}
                className={`p-4 text-center transition-all ${
                  unlocked
                    ? 'bg-yellow-500/10 border-yellow-400/50'
                    : 'opacity-40'
                }`}
              >
                <p className="text-3xl mb-1">{achievement.icon}</p>
                <p className="text-xs font-medium">{achievement.name}</p>
                {!unlocked && (
                  <p className="text-xs text-white/40 mt-1">
                    {achievement.xpRequired} XP
                  </p>
                )}
              </GlassCard>
            )
          })}
        </div>
      </div>

      {/* Privilege Requests Status */}
      {(privilegeRequests?.length || 0) > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Your Requests</h2>
          <div className="space-y-2">
            {privilegeRequests?.map((request) => (
              <GlassCard key={request.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {request.privilege?.name}
                    </p>
                    <p className="text-xs text-white/50">
                      {request.status}
                    </p>
                  </div>
                  <Badge
                    variant={
                      request.status === 'approved'
                        ? 'approved'
                        : request.status === 'denied'
                        ? 'rejected'
                        : 'pending'
                    }
                  >
                    {request.status}
                  </Badge>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Bounty Board */}
      {(bonusTasks?.length || 0) > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Bonus Bounties 🎯</h2>
          <div className="space-y-3">
            {bonusTasks?.map((bonus) => {
              const isClaimed = bonus.claimed_by
              const isAssignedToMe = bonus.assigned_to === profile?.id

              return (
                <GlassCard
                  key={bonus.id}
                  className={`p-4 ${
                    isClaimed
                      ? 'opacity-50 border-white/5'
                      : isAssignedToMe
                      ? 'border-orange-400/50 bg-orange-500/5'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{bonus.name}</h3>
                      {bonus.description && (
                        <p className="text-xs text-white/60 mb-2">
                          {bonus.description}
                        </p>
                      )}
                      <div className="flex gap-2 items-center">
                        <Badge variant="level">
                          +{bonus.xp_bonus} XP
                        </Badge>
                        {bonus.type === 'assigned' && isAssignedToMe && (
                          <span className="text-xs text-orange-400">
                            Assigned to you
                          </span>
                        )}
                      </div>
                    </div>

                    {!isClaimed && (
                      <Button
                        onClick={() => claimBonusMutation.mutate(bonus.id)}
                        disabled={claimBonusMutation.isPending}
                        size="sm"
                        variant="secondary"
                      >
                        Claim
                      </Button>
                    )}

                    {isClaimed && (
                      <Badge variant="pending">Claimed</Badge>
                    )}
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

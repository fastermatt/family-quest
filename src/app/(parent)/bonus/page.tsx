'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

const BONUS_TYPES = [
  { value: 'open_bounty', label: 'Open Bounty' },
  { value: 'assigned', label: 'Assigned to Child' },
]

const REWARD_TYPES = [
  { value: 'xp', label: 'XP' },
  { value: 'experience', label: 'Experience' },
  { value: 'privilege', label: 'Privilege' },
  { value: 'money', label: 'Money' },
  { value: 'item', label: 'Item' },
]

export default function BonusPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'open_bounty',
    assignedTo: '',
    rewardType: 'xp',
    rewardValue: '',
    rewardDescription: '',
    xpBonus: 500,
    deadline: '',
    photoRequired: false,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/active-profile')
      if (!res.ok) return null
      return res.json()
    },
  })

  const { data: children } = useQuery({
    queryKey: ['children', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('role', 'child')
      return data || []
    },
    enabled: !!profile?.family_id,
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
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const createBonusMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('No family')

      await supabase.from('bonus_tasks').insert([
        {
          family_id: profile.family_id,
          name: formData.name,
          description: formData.description,
          type: formData.type,
          assigned_to: formData.type === 'assigned' ? formData.assignedTo : null,
          reward_type: formData.rewardType,
          reward_value: formData.rewardValue,
          reward_description: formData.rewardDescription,
          xp_bonus: formData.xpBonus,
          status: 'active',
          deadline: formData.deadline || null,
          photo_required: formData.photoRequired,
          created_by: profile.id,
        },
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonusTasks'] })
      setFormData({
        name: '',
        description: '',
        type: 'open_bounty',
        assignedTo: '',
        rewardType: 'xp',
        rewardValue: '',
        rewardDescription: '',
        xpBonus: 500,
        deadline: '',
        photoRequired: false,
      })
    },
  })

  const deleteBonusMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!window.confirm('Delete this bonus task? This cannot be undone.')) return
      await supabase.from('bonus_tasks').delete().eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonusTasks'] })
    },
  })

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Bonus Board</h1>

      {/* Create Bonus */}
      <GlassCard className="p-6">
        <h2 className="text-2xl font-bold mb-4">Create New Bonus</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createBonusMutation.mutate()
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Clean the garage"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value })
                }
                className="w-full"
              >
                {BONUS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {formData.type === 'assigned' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Assign To
                </label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) =>
                    setFormData({ ...formData, assignedTo: e.target.value })
                  }
                  required
                  className="w-full"
                >
                  <option value="">Select a child</option>
                  {children?.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.avatar_emoji} {child.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">
                Reward Type
              </label>
              <select
                value={formData.rewardType}
                onChange={(e) =>
                  setFormData({ ...formData, rewardType: e.target.value })
                }
                className="w-full"
              >
                {REWARD_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                XP Bonus
              </label>
              <input
                type="number"
                min="10"
                value={formData.xpBonus}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    xpBonus: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Reward Value
              </label>
              <input
                type="text"
                value={formData.rewardValue}
                onChange={(e) =>
                  setFormData({ ...formData, rewardValue: e.target.value })
                }
                placeholder="e.g., $10, Movie ticket"
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="What needs to be done?"
              className="w-full h-24"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Reward Description
            </label>
            <input
              type="text"
              value={formData.rewardDescription}
              onChange={(e) =>
                setFormData({ ...formData, rewardDescription: e.target.value })
              }
              placeholder="What do they get?"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Deadline
              </label>
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) =>
                  setFormData({ ...formData, deadline: e.target.value })
                }
                className="w-full"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.photoRequired}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      photoRequired: e.target.checked,
                    })
                  }
                />
                <span className="text-sm font-medium">Photo Required</span>
              </label>
            </div>
          </div>

          <Button
            type="submit"
            disabled={createBonusMutation.isPending}
            className="w-full"
          >
            {createBonusMutation.isPending ? 'Creating...' : 'Create Bonus'}
          </Button>
        </form>
      </GlassCard>

      {/* Active Bonuses */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Active Bonuses</h2>
        <div className="space-y-3">
          {bonusTasks?.map((bonus) => {
            const childName = bonus.assigned_to
              ? children?.find((c) => c.id === bonus.assigned_to)?.name
              : 'Anyone'

            return (
              <GlassCard key={bonus.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{bonus.name}</h3>
                      <Badge variant="level">{bonus.xp_bonus} XP</Badge>
                    </div>
                    {bonus.description && (
                      <p className="text-sm text-white/60 mb-2">
                        {bonus.description}
                      </p>
                    )}
                    <div className="text-xs text-white/40 space-y-1">
                      <p>
                        Type:{' '}
                        {bonus.type === 'open_bounty'
                          ? 'Open Bounty'
                          : 'Assigned'}
                      </p>
                      <p>For: {childName}</p>
                      {bonus.deadline && (
                        <p>
                          Due:{' '}
                          {new Date(bonus.deadline).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteBonusMutation.mutate(bonus.id)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 border border-red-400/50 text-red-300 hover:bg-red-500/30"
                  >
                    Delete
                  </button>
                </div>
              </GlassCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}

'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

const GATING_MODES = [
  { value: 'always_available', label: 'Always Available' },
  { value: 'all_tasks', label: 'All Tasks Completed' },
  { value: 'specific_tasks', label: 'Specific Tasks' },
]

interface PrivilegeInput {
  name: string
  description: string
  gatingMode: string
  requiredTasks: string[]
  visibleTo: string[]
}

export default function PrivilegesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [privInputs, setPrivInputs] = useState<PrivilegeInput[]>([
    {
      name: '',
      description: '',
      gatingMode: 'all_tasks',
      requiredTasks: [],
      visibleTo: [],
    },
  ])
  const [privText, setPrivText] = useState('')

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

  const { data: templates } = useQuery({
    queryKey: ['templates', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('task_templates')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('active', true)
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const { data: privileges } = useQuery({
    queryKey: ['privileges', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('privileges')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const createPrivilegesMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('No family')

      const privsToCreate = privInputs.filter((p) => p.name.trim())

      for (const priv of privsToCreate) {
        await supabase.from('privileges').insert([
          {
            family_id: profile.family_id,
            name: priv.name,
            description: priv.description,
            gating_mode: priv.gatingMode,
            required_template_ids:
              priv.gatingMode === 'specific_tasks' ? priv.requiredTasks : [],
            visible_to: priv.visibleTo,
            created_by: profile.id,
          },
        ])
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privileges'] })
      setPrivInputs([
        {
          name: '',
          description: '',
          gatingMode: 'all_tasks',
          requiredTasks: [],
          visibleTo: [],
        },
      ])
      setPrivText('')
    },
  })

  const deletePrivilegeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!window.confirm('Delete this privilege? This cannot be undone.')) return
      await supabase.from('privileges').delete().eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privileges'] })
    },
  })

  const parsePrivilegeInput = () => {
    const lines = privText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)

    const newInputs: PrivilegeInput[] = lines.map((name) => ({
      name,
      description: '',
      gatingMode: 'all_tasks',
      requiredTasks: [],
      visibleTo: [],
    }))

    setPrivInputs(newInputs)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Privileges & Rewards</h1>

      {/* Quick Entry */}
      <GlassCard className="p-6">
        <h2 className="text-2xl font-bold mb-4">Quick Privilege Entry</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Paste privilege names (one per line)
            </label>
            <textarea
              value={privText}
              onChange={(e) => setPrivText(e.target.value)}
              placeholder="Extra screen time&#10;Movie night&#10;Choose dinner"
              className="w-full h-32"
            />
          </div>
          <Button onClick={parsePrivilegeInput} variant="secondary">
            Parse Privileges
          </Button>
        </div>
      </GlassCard>

      {/* Privilege Configuration */}
      {privInputs.some((p) => p.name.trim()) && (
        <GlassCard className="p-6">
          <h2 className="text-2xl font-bold mb-4">Configure Privileges</h2>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {privInputs.map(
              (priv, idx) =>
                priv.name.trim() && (
                  <div key={idx} className="glass-card p-4 space-y-3">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Name
                      </label>
                      <p className="font-semibold text-sm">{priv.name}</p>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={priv.description}
                        onChange={(e) => {
                          const updated = [...privInputs]
                          updated[idx].description = e.target.value
                          setPrivInputs(updated)
                        }}
                        placeholder="What is this privilege?"
                        className="w-full text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Gate By
                      </label>
                      <select
                        value={priv.gatingMode}
                        onChange={(e) => {
                          const updated = [...privInputs]
                          updated[idx].gatingMode = e.target.value
                          updated[idx].requiredTasks = []
                          setPrivInputs(updated)
                        }}
                        className="w-full text-sm"
                      >
                        {GATING_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {priv.gatingMode === 'specific_tasks' && (
                      <div>
                        <label className="block text-xs text-white/60 mb-2">
                          Required Tasks
                        </label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {templates?.map((template) => (
                            <label
                              key={template.id}
                              className="flex items-center gap-2 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={priv.requiredTasks.includes(
                                  template.id
                                )}
                                onChange={(e) => {
                                  const updated = [...privInputs]
                                  if (e.target.checked) {
                                    updated[idx].requiredTasks.push(
                                      template.id
                                    )
                                  } else {
                                    updated[idx].requiredTasks = updated[
                                      idx
                                    ].requiredTasks.filter(
                                      (id) => id !== template.id
                                    )
                                  }
                                  setPrivInputs(updated)
                                }}
                              />
                              {template.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-white/60 mb-2">
                        Visible To
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {children?.map((child) => (
                          <label key={child.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={priv.visibleTo.includes(child.id)}
                              onChange={(e) => {
                                const updated = [...privInputs]
                                if (e.target.checked) {
                                  updated[idx].visibleTo.push(child.id)
                                } else {
                                  updated[idx].visibleTo = updated[
                                    idx
                                  ].visibleTo.filter(
                                    (id) => id !== child.id
                                  )
                                }
                                setPrivInputs(updated)
                              }}
                            />
                            {child.avatar_emoji} {child.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )
            )}
          </div>

          <Button
            onClick={() => createPrivilegesMutation.mutate()}
            disabled={createPrivilegesMutation.isPending}
            className="w-full mt-4"
          >
            {createPrivilegesMutation.isPending ? 'Creating...' : 'Save All Privileges'}
          </Button>
        </GlassCard>
      )}

      {/* Active Privileges */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Active Privileges</h2>
        <div className="space-y-3">
          {privileges?.map((privilege) => (
            <GlassCard key={privilege.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{privilege.name}</p>
                  {privilege.description && (
                    <p className="text-sm text-white/60 mt-1">
                      {privilege.description}
                    </p>
                  )}
                  <p className="text-xs text-white/40 mt-1">
                    Gate: {privilege.gating_mode.replace(/_/g, ' ')}
                  </p>
                </div>
                <button
                  onClick={() => deletePrivilegeMutation.mutate(privilege.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 border border-red-400/50 text-red-300 hover:bg-red-500/30"
                >
                  Delete
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  )
}

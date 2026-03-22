'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Image from 'next/image'

export default function ReviewPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({})
  const [conditionalNotes, setConditionalNotes] = useState<Record<string, string>>({})
  const [conditionalMinutes, setConditionalMinutes] = useState<Record<string, number>>({})

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

  const { data: pendingTasks } = useQuery({
    queryKey: ['pendingTasks', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data: tasks } = await supabase
        .from('task_instances')
        .select('*')
        .eq('status', 'submitted')
      const { data: templates } = await supabase
        .from('task_templates')
        .select('*')
        .eq('family_id', profile.family_id)

      return (tasks || []).map((task) => ({
        ...task,
        task_template: templates?.find((t) => t.id === task.template_id),
      }))
    },
    enabled: !!profile?.family_id,
  })

  const { data: pendingRequests } = useQuery({
    queryKey: ['pendingRequests', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return []
      const { data } = await supabase
        .from('privilege_requests')
        .select(`*,privilege:privileges(*)`)
        .eq('status', 'pending')
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const approvTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const task = pendingTasks?.find((t) => t.id === taskId)
      if (!task) return

      // 1. Mark task as approved
      await supabase
        .from('task_instances')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          xp_awarded: task.task_template?.xp_value || 100,
        })
        .eq('id', taskId)

      const xpGained = task.task_template?.xp_value || 100
      const child = children?.find((c) => c.id === task.assigned_to)

      // 2. Update child XP
      if (child) {
        const newXP = (child.xp_total || 0) + xpGained
        await supabase
          .from('profiles')
          .update({ xp_total: newXP })
          .eq('id', child.id)

        // 3. Check streak — if this was the last task to complete today, increment streak
        const today = new Date().toISOString().split('T')[0]
        const { data: allTodayTasks } = await supabase
          .from('task_instances')
          .select('id, status')
          .eq('assigned_to', task.assigned_to)
          .eq('due_date', today)

        // Other tasks that are still not approved
        const otherNonApproved = allTodayTasks?.filter(
          (t) => t.id !== taskId && t.status !== 'approved'
        ) || []

        if (otherNonApproved.length === 0 && (allTodayTasks?.length || 0) > 0) {
          // All tasks are now done — increment streak
          const newStreak = (child.current_streak || 0) + 1
          await supabase
            .from('profiles')
            .update({ current_streak: newStreak })
            .eq('id', child.id)
        }
      }

      // 4. Update family XP
      if (profile?.family_id) {
        const { data: family } = await supabase
          .from('families')
          .select('family_xp, family_level')
          .eq('id', profile.family_id)
          .single()

        if (family) {
          const newFamilyXP = (family.family_xp || 0) + xpGained
          const newFamilyLevel = Math.floor(newFamilyXP / 5000) + 1
          await supabase
            .from('families')
            .update({ family_xp: newFamilyXP, family_level: newFamilyLevel })
            .eq('id', profile.family_id)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] })
      queryClient.invalidateQueries({ queryKey: ['children'] })
      queryClient.invalidateQueries({ queryKey: ['family'] })
    },
  })

  const rejectTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      note,
    }: {
      taskId: string
      note: string
    }) => {
      await supabase
        .from('task_instances')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          review_note: note,
        })
        .eq('id', taskId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] })
    },
  })

  const approveRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await supabase
        .from('privilege_requests')
        .update({
          status: 'approved',
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
    },
  })

  const denyRequestMutation = useMutation({
    mutationFn: async ({
      requestId,
      note,
    }: {
      requestId: string
      note: string
    }) => {
      await supabase
        .from('privilege_requests')
        .update({
          status: 'denied',
          responded_at: new Date().toISOString(),
          response_note: note,
        })
        .eq('id', requestId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
    },
  })

  const conditionalRequestMutation = useMutation({
    mutationFn: async ({
      requestId,
      note,
      timeLimit,
    }: {
      requestId: string
      note: string
      timeLimit: number
    }) => {
      await supabase
        .from('privilege_requests')
        .update({
          status: 'conditional',
          responded_at: new Date().toISOString(),
          response_note: note,
          time_limit_minutes: timeLimit,
        })
        .eq('id', requestId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] })
    },
  })

  const tasksByChild = pendingTasks?.reduce(
    (acc, task) => {
      const childId = task.assigned_to
      if (!acc[childId]) acc[childId] = []
      acc[childId].push(task)
      return acc
    },
    {} as Record<string, typeof pendingTasks>
  )

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Review & Approval</h1>

      {/* Task Reviews by Child */}
      {children?.map((child) => {
        const childTasks = tasksByChild?.[child.id] || []
        if (childTasks.length === 0) return null

        return (
          <div key={child.id}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{child.avatar_emoji}</span>
              <div>
                <h2 className="text-xl font-bold">{child.name}</h2>
                <p className="text-sm text-white/60">
                  {childTasks.length} task{childTasks.length !== 1 ? 's' : ''} to review
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              {childTasks.map((task: any) => (
                <GlassCard key={task.id} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Task Info */}
                    <div className="md:col-span-1">
                      <h3 className="font-bold text-lg mb-2">
                        {task.task_template?.name || 'Unknown Task'}
                      </h3>
                      <div className="space-y-1 text-sm text-white/60">
                        <p>Category: {task.task_template?.category}</p>
                        <p>XP Value: {task.task_template?.xp_value}</p>
                        <p>
                          Submitted:{' '}
                          {task.submitted_at
                            ? new Date(task.submitted_at).toLocaleString()
                            : 'N/A'}
                        </p>
                      </div>

                      {task.photo_challenge_prompt && (
                        <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-400/50">
                          <p className="text-xs text-orange-300 font-medium">
                            Challenge: {task.photo_challenge_prompt}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Photo */}
                    {task.photo_url && (
                      <div className="md:col-span-1">
                        <p className="text-sm font-medium mb-2">Submitted Photo</p>
                        <div className="relative h-48 rounded-lg overflow-hidden bg-white/5">
                          <Image
                            src={task.photo_url}
                            alt="Task submission"
                            fill
                            className="object-cover"
                          />
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="md:col-span-1 flex flex-col gap-2">
                      <Button
                        onClick={() => approvTaskMutation.mutate(task.id)}
                        disabled={approvTaskMutation.isPending}
                        className="w-full"
                        variant="primary"
                      >
                        ✓ Approve (+{task.task_template?.xp_value || 100} XP)
                      </Button>

                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Rejection note..."
                          value={rejectionNotes[task.id] || ''}
                          onChange={(e) =>
                            setRejectionNotes({
                              ...rejectionNotes,
                              [task.id]: e.target.value,
                            })
                          }
                          className="w-full text-sm h-auto"
                        />
                        <Button
                          onClick={() =>
                            rejectTaskMutation.mutate({
                              taskId: task.id,
                              note: rejectionNotes[task.id] || '',
                            })
                          }
                          disabled={rejectTaskMutation.isPending}
                          className="w-full"
                          variant="danger"
                        >
                          ✗ Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )
      })}

      {/* Privilege Requests */}
      {(pendingRequests?.length || 0) > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Privilege Requests</h2>
          <div className="space-y-4">
            {pendingRequests?.map((request) => {
              const requester = children?.find(
                (c) => c.id === request.requested_by
              )
              const timeLimit = conditionalMinutes[request.id] ?? 120

              return (
                <GlassCard key={request.id} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-bold text-lg mb-2">
                        {requester?.avatar_emoji} {requester?.name}
                      </h3>
                      <p className="text-white/60 mb-4">
                        Requesting: <span className="text-teal-400">{request.privilege?.name}</span>
                      </p>
                      {request.privilege?.description && (
                        <p className="text-sm text-white/50 mb-4">
                          {request.privilege.description}
                        </p>
                      )}
                      <p className="text-xs text-white/40">
                        Requested:{' '}
                        {new Date(request.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() =>
                          approveRequestMutation.mutate(request.id)
                        }
                        disabled={approveRequestMutation.isPending}
                        className="w-full"
                        variant="primary"
                      >
                        ✓ Approve
                      </Button>
                      <Button
                        onClick={() =>
                          denyRequestMutation.mutate({
                            requestId: request.id,
                            note: '',
                          })
                        }
                        disabled={denyRequestMutation.isPending}
                        className="w-full"
                        variant="danger"
                      >
                        ✗ Deny
                      </Button>

                      {/* Conditional approval with editable time limit */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Note (optional)"
                            value={conditionalNotes[request.id] || ''}
                            onChange={(e) =>
                              setConditionalNotes({
                                ...conditionalNotes,
                                [request.id]: e.target.value,
                              })
                            }
                            className="flex-1 text-sm h-auto"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="5"
                            max="480"
                            value={timeLimit}
                            onChange={(e) =>
                              setConditionalMinutes({
                                ...conditionalMinutes,
                                [request.id]: parseInt(e.target.value) || 120,
                              })
                            }
                            className="w-20 text-sm h-auto"
                          />
                          <span className="text-xs text-white/60">min</span>
                          <Button
                            onClick={() =>
                              conditionalRequestMutation.mutate({
                                requestId: request.id,
                                note: conditionalNotes[request.id] || 'For this session only',
                                timeLimit,
                              })
                            }
                            disabled={conditionalRequestMutation.isPending}
                            className="flex-1"
                            variant="secondary"
                          >
                            ⏱️ Conditional
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      )}

      {!pendingTasks?.length && !pendingRequests?.length && (
        <GlassCard className="p-8 text-center">
          <p className="text-white/60">
            No pending reviews or requests at this time. Great job keeping up!
          </p>
        </GlassCard>
      )}
    </div>
  )
}

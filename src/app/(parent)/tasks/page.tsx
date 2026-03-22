'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Profile, TaskTemplate } from '@/lib/types'

const CATEGORIES = [
  'Kitchen',
  'Bedroom',
  'Bathroom',
  'Laundry',
  'Pet Care',
  'Outdoor',
  'Schoolwork',
  'General',
]

const RECURRENCES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'once', label: 'Once' },
]

interface TaskInput {
  name: string
  category: string
  assignedTo: string[]
  recurrence: string
  photoRequired: boolean
  xpValue: number
  difficultyStars: number
}

export default function TasksPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [taskInputs, setTaskInputs] = useState<TaskInput[]>([
    {
      name: '',
      category: CATEGORIES[0],
      assignedTo: [],
      recurrence: 'daily',
      photoRequired: false,
      xpValue: 100,
      difficultyStars: 1,
    },
  ])
  const [taskText, setTaskText] = useState('')

  // Get family & children
  // user loaded via profile query below
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
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!profile?.family_id,
  })

  const createTasksMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('No family')

      const tasksToCreate = taskInputs.filter((t) => t.name.trim())

      // Validate at least one child is assigned to each task
      const unassigned = tasksToCreate.filter((t) => t.assignedTo.length === 0)
      if (unassigned.length > 0) {
        throw new Error(`Please assign each task to at least one child: ${unassigned.map((t) => t.name).join(', ')}`)
      }

      for (const task of tasksToCreate) {
        const { data: template } = await supabase
          .from('task_templates')
          .insert([
            {
              family_id: profile.family_id,
              name: task.name,
              category: task.category,
              recurrence_type: task.recurrence,
              recurrence_days: [],
              reset_hour: 0,
              photo_required: task.photoRequired,
              xp_value: task.xpValue,
              difficulty_stars: task.difficultyStars,
              active: true,
              created_by: profile.id,
            },
          ])
          .select()
          .single()

        // Create assignments
        for (const childId of task.assignedTo) {
          await supabase.from('task_assignments').insert([
            {
              template_id: template.id,
              assigned_to: childId,
            },
          ])
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setTaskInputs([
        {
          name: '',
          category: CATEGORIES[0],
          assignedTo: [],
          recurrence: 'daily',
          photoRequired: false,
          xpValue: 100,
          difficultyStars: 1,
        },
      ])
      setTaskText('')
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!window.confirm('Delete this task? This cannot be undone.')) return
      await supabase.from('task_templates').delete().eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({
      id,
      active,
    }: {
      id: string
      active: boolean
    }) => {
      await supabase
        .from('task_templates')
        .update({ active: !active })
        .eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const parseTaskInput = () => {
    const lines = taskText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)

    const newInputs: TaskInput[] = lines.map((name) => ({
      name,
      category: CATEGORIES[0],
      assignedTo: [],
      recurrence: 'daily',
      photoRequired: false,
      xpValue: 100,
      difficultyStars: 1,
    }))

    setTaskInputs(newInputs)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Task Manager</h1>

      {/* Quick Entry */}
      <GlassCard className="p-6">
        <h2 className="text-2xl font-bold mb-4">Quick Task Entry</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Paste task names (one per line)
            </label>
            <textarea
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              placeholder="Clean kitchen&#10;Wash dishes&#10;Organize closet"
              className="w-full h-32"
            />
          </div>
          <Button onClick={parseTaskInput} variant="secondary">
            Parse Tasks
          </Button>
        </div>
      </GlassCard>

      {/* Task Configuration */}
      {taskInputs.some((t) => t.name.trim()) && (
        <GlassCard className="p-6">
          <h2 className="text-2xl font-bold mb-4">Configure Tasks</h2>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {taskInputs.map(
              (task, idx) =>
                task.name.trim() && (
                  <div key={idx} className="glass-card p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          Name
                        </label>
                        <p className="font-semibold text-sm">{task.name}</p>
                      </div>

                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          Category
                        </label>
                        <select
                          value={task.category}
                          onChange={(e) => {
                            const updated = [...taskInputs]
                            updated[idx].category = e.target.value
                            setTaskInputs(updated)
                          }}
                          className="w-full text-sm"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          Recurrence
                        </label>
                        <select
                          value={task.recurrence}
                          onChange={(e) => {
                            const updated = [...taskInputs]
                            updated[idx].recurrence = e.target.value
                            setTaskInputs(updated)
                          }}
                          className="w-full text-sm"
                        >
                          {RECURRENCES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          XP Value
                        </label>
                        <input
                          type="number"
                          min="10"
                          value={task.xpValue}
                          onChange={(e) => {
                            const updated = [...taskInputs]
                            updated[idx].xpValue = parseInt(e.target.value)
                            setTaskInputs(updated)
                          }}
                          className="w-full text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          Difficulty
                        </label>
                        <select
                          value={task.difficultyStars}
                          onChange={(e) => {
                            const updated = [...taskInputs]
                            updated[idx].difficultyStars = parseInt(e.target.value)
                            setTaskInputs(updated)
                          }}
                          className="w-full text-sm"
                        >
                          {[1, 2, 3, 4, 5].map((d) => (
                            <option key={d} value={d}>
                              {'⭐'.repeat(d)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={task.photoRequired}
                          onChange={(e) => {
                            const updated = [...taskInputs]
                            updated[idx].photoRequired = e.target.checked
                            setTaskInputs(updated)
                          }}
                          id={`photo-${idx}`}
                        />
                        <label htmlFor={`photo-${idx}`} className="text-xs text-white/60">
                          Photo Required
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-2">
                        Assign To
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {children?.map((child) => (
                          <label key={child.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={task.assignedTo.includes(child.id)}
                              onChange={(e) => {
                                const updated = [...taskInputs]
                                if (e.target.checked) {
                                  updated[idx].assignedTo.push(child.id)
                                } else {
                                  updated[idx].assignedTo = updated[idx].assignedTo.filter(
                                    (id) => id !== child.id
                                  )
                                }
                                setTaskInputs(updated)
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

          {createTasksMutation.isError && (
            <p className="text-red-400 text-sm mt-2">
              {(createTasksMutation.error as Error)?.message || 'Failed to save tasks'}
            </p>
          )}
          <Button
            onClick={() => createTasksMutation.mutate()}
            disabled={createTasksMutation.isPending}
            className="w-full mt-4"
          >
            {createTasksMutation.isPending ? 'Creating...' : 'Save All Tasks'}
          </Button>
        </GlassCard>
      )}

      {/* Active Tasks */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Active Tasks</h2>
        <div className="space-y-3">
          {templates?.map((template) => (
            <GlassCard key={template.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{template.name}</p>
                <div className="flex gap-2 text-xs text-white/60 mt-1">
                  <span>{template.category}</span>
                  <span>•</span>
                  <span>{template.xp_value} XP</span>
                  <span>•</span>
                  <span>{'⭐'.repeat(template.difficulty_stars)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    toggleActiveMutation.mutate({
                      id: template.id,
                      active: template.active,
                    })
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    template.active
                      ? 'bg-green-500/20 border border-green-400/50 text-green-300'
                      : 'bg-white/5 border border-white/10 text-white/60'
                  }`}
                >
                  {template.active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => deleteTemplateMutation.mutate(template.id)}
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

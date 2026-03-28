'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Profile, TaskTemplate, TaskAssignment, TimeOfDay } from '@/lib/types'

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

const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string; emoji: string }[] = [
  { value: 'anytime', label: 'Anytime', emoji: '\u{1F553}' },
  { value: 'morning', label: 'Morning', emoji: '\u{1F305}' },
  { value: 'afternoon', label: 'Afternoon', emoji: '\u2600\uFE0F' },
  { value: 'evening', label: 'Evening', emoji: '\u{1F319}' },
]

interface TaskInput {
  name: string
  category: string
  assignedTo: string[]
  recurrence: string
  photoRequired: boolean
  xpValue: number
  difficultyStars: number
  timeOfDay: TimeOfDay
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
      timeOfDay: 'anytime',
    },
  ])
  const [taskText, setTaskText] = useState('')
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      return (data || []) as TaskTemplate[]
    },
    enabled: !!profile?.family_id,
  })

  const { data: assignments } = useQuery({
    queryKey: ['assignments', templates?.map((t) => t.id)],
    queryFn: async () => {
      if (!templates?.length) return []
      const { data } = await supabase
        .from('task_assignments')
        .select('*')
        .in(
          'template_id',
          templates.map((t) => t.id)
        )
      return (data || []) as TaskAssignment[]
    },
    enabled: !!templates?.length,
  })

  const createTasksMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('No family')
      const tasksToCreate = taskInputs.filter((t) => t.name.trim())
      for (const task of tasksToCreate) {
        // Validate XP bounds
        const xp = Math.max(0, Math.min(task.xpValue || 100, 10000))
        const difficulty = Math.max(1, Math.min(task.difficultyStars || 1, 5))
        const { data: template } = await supabase
          .from('task_templates')
          .insert([{
            family_id: profile.family_id,
            name: task.name.trim().slice(0, 200),
            category: task.category,
            recurrence_type: task.recurrence,
            recurrence_days: [],
            reset_hour: 0,
            photo_required: task.photoRequired,
            xp_value: xp,
            difficulty_stars: difficulty,
            time_of_day: task.timeOfDay,
            active: true,
            created_by: profile.id,
          }])
          .select()
          .single()
        for (const childId of task.assignedTo) {
          await supabase.from('task_assignments').insert([{ template_id: template.id, assigned_to: childId }])
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      setTaskInputs([{ name: '', category: CATEGORIES[0], assignedTo: [], recurrence: 'daily', photoRequired: false, xpValue: 100, difficultyStars: 1, timeOfDay: 'anytime' }])
      setTaskText('')
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!window.confirm('Delete this task? This cannot be undone.')) return
      await supabase.from('task_assignments').delete().eq('template_id', id)
      await supabase.from('task_templates').delete().eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await supabase.from('task_templates').update({ active: !active }).eq('id', id)
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }) },
  })

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      // Validate bounds for numeric fields
      let safeValue = value
      if (field === 'xp_value') safeValue = Math.max(0, Math.min(Number(value) || 100, 10000))
      if (field === 'difficulty_stars') safeValue = Math.max(1, Math.min(Number(value) || 1, 5))
      await supabase.from('task_templates').update({ [field]: safeValue }).eq('id', id)
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }) },
  })

  const toggleAssignmentMutation = useMutation({
    mutationFn: async ({ templateId, childId, assigned }: { templateId: string; childId: string; assigned: boolean }) => {
      if (assigned) {
        await supabase.from('task_assignments').delete().eq('template_id', templateId).eq('assigned_to', childId)
      } else {
        await supabase.from('task_assignments').insert([{ template_id: templateId, assigned_to: childId }])
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assignments'] }) },
  })

  const parseTaskInput = () => {
    const lines = taskText.split('\n').map((l) => l.trim()).filter((l) => l)
    setTaskInputs(lines.map((name) => ({ name, category: CATEGORIES[0], assignedTo: [], recurrence: 'daily', photoRequired: false, xpValue: 100, difficultyStars: 1, timeOfDay: 'anytime' as TimeOfDay })))
  }

  const getAssignedChildIds = (templateId: string): string[] =>
    (assignments || []).filter((a) => a.template_id === templateId).map((a) => a.assigned_to)

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Task Manager</h1>

      <GlassCard className="p-6">
        <h2 className="text-2xl font-bold mb-4">Quick Task Entry</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Paste task names (one per line)</label>
            <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="Clean kitchen\nWash dishes\nOrganize closet" className="w-full h-32" />
          </div>
          <Button onClick={parseTaskInput} variant="secondary">Parse Tasks</Button>
        </div>
      </GlassCard>

      {taskInputs.some((t) => t.name.trim()) && (
        <GlassCard className="p-6">
          <h2 className="text-2xl font-bold mb-4">Configure Tasks</h2>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {taskInputs.map((task, idx) => task.name.trim() && (
              <div key={idx} className="glass-card p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-white/60 mb-1">Name</label><p className="font-semibold text-sm">{task.name}</p></div>
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Category</label>
                    <select value={task.category} onChange={(e) => { const u=[...taskInputs]; u[idx].category=e.target.value; setTaskInputs(u) }} className="w-full text-sm">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Recurrence</label>
                    <select value={task.recurrence} onChange={(e) => { const u=[...taskInputs]; u[idx].recurrence=e.target.value; setTaskInputs(u) }} className="w-full text-sm">
                      {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Time of Day</label>
                    <select value={task.timeOfDay} onChange={(e) => { const u=[...taskInputs]; u[idx].timeOfDay=e.target.value as TimeOfDay; setTaskInputs(u) }} className="w-full text-sm">
                      {TIME_OF_DAY_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/60 mb-1">XP Value</label>
                    <input type="number" min="10" value={task.xpValue} onChange={(e) => { const u=[...taskInputs]; u[idx].xpValue=parseInt(e.target.value); setTaskInputs(u) }} className="w-full text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Difficulty</label>
                    <select value={task.difficultyStars} onChange={(e) => { const u=[...taskInputs]; u[idx].difficultyStars=parseInt(e.target.value); setTaskInputs(u) }} className="w-full text-sm">
                      {[1,2,3,4,5].map((d) => <option key={d} value={d}>{'\u2B50'.repeat(d)}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={task.photoRequired} onChange={(e) => { const u=[...taskInputs]; u[idx].photoRequired=e.target.checked; setTaskInputs(u) }} id={`photo-${idx}`} />
                    <label htmlFor={`photo-${idx}`} className="text-xs text-white/60">Photo Required</label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-2">Assign To</label>
                  <div className="grid grid-cols-2 gap-2">
                    {children?.map((child) => (
                      <label key={child.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={task.assignedTo.includes(child.id)} onChange={(e) => { const u=[...taskInputs]; if(e.target.checked){u[idx].assignedTo.push(child.id)}else{u[idx].assignedTo=u[idx].assignedTo.filter((id)=>id!==child.id)}; setTaskInputs(u) }} />
                        {child.avatar_emoji} {child.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={() => createTasksMutation.mutate()} disabled={createTasksMutation.isPending} className="w-full mt-4">
            {createTasksMutation.isPending ? 'Creating...' : 'Save All Tasks'}
          </Button>
        </GlassCard>
      )}

      <div>
        <h2 className="text-2xl font-bold mb-4">Your Tasks ({templates?.length || 0})</h2>
        <div className="space-y-3">
          {templates?.map((template) => {
            const isExpanded = expandedCards.has(template.id)
            const assignedIds = getAssignedChildIds(template.id)
            const todOption = TIME_OF_DAY_OPTIONS.find((t) => t.value === (template.time_of_day || 'anytime'))

            return (
              <GlassCard key={template.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-lg">{template.name}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-white/60 mt-1">
                      <span>{template.category}</span>
                      <span>•</span>
                      <span>{template.xp_value} XP</span>
                      <span>•</span>
                      <span>{'\u2B50'.repeat(template.difficulty_stars)}</span>
                      {template.photo_required && <><span>•</span><span>📸</span></>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => toggleExpanded(template.id)} className="px-3 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 transition-all">
                      {isExpanded ? 'Less \u25B2' : 'Edit \u25BC'}
                    </button>
                    <button onClick={() => toggleActiveMutation.mutate({ id: template.id, active: template.active })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${template.active ? 'bg-green-500/20 border border-green-400/50 text-green-300' : 'bg-white/5 border border-white/10 text-white/60'}`}>
                      {template.active ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => deleteTemplateMutation.mutate(template.id)} className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 border border-red-400/50 text-red-300 hover:bg-red-500/30">
                      Delete
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <select value={template.recurrence_type} onChange={(e) => updateFieldMutation.mutate({ id: template.id, field: 'recurrence_type', value: e.target.value })}
                    className="text-xs rounded-lg px-2.5 py-1.5 bg-white/5 border border-white/10 text-white/80 appearance-none cursor-pointer hover:bg-white/10 transition-all">
                    {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>

                  <select value={template.time_of_day || 'anytime'} onChange={(e) => updateFieldMutation.mutate({ id: template.id, field: 'time_of_day', value: e.target.value })}
                    className="text-xs rounded-lg px-2.5 py-1.5 bg-white/5 border border-white/10 text-white/80 appearance-none cursor-pointer hover:bg-white/10 transition-all">
                    {TIME_OF_DAY_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                  </select>

                  <button onClick={() => updateFieldMutation.mutate({ id: template.id, field: 'photo_required', value: !template.photo_required })}
                    className={`text-xs rounded-lg px-2.5 py-1.5 border transition-all cursor-pointer ${template.photo_required ? 'bg-teal-500/20 border-teal-400/50 text-teal-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
                    📸 Photo {template.photo_required ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {children?.map((child) => {
                    const isAssigned = assignedIds.includes(child.id)
                    return (
                      <label key={child.id} className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border cursor-pointer transition-all ${isAssigned ? 'bg-teal-500/20 border-teal-400/50 text-teal-200' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>
                        <input type="checkbox" checked={isAssigned} onChange={() => toggleAssignmentMutation.mutate({ templateId: template.id, childId: child.id, assigned: isAssigned })} className="sr-only" />
                        <span>{child.avatar_emoji}</span>
                        <span>{child.name}</span>
                      </label>
                    )
                  })}
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Category</label>
                      <select value={template.category} onChange={(e) => updateFieldMutation.mutate({ id: template.id, field: 'category', value: e.target.value })} className="w-full text-sm">
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">XP Value</label>
                      <input type="number" min="10" value={template.xp_value} onChange={(e) => updateFieldMutation.mutate({ id: template.id, field: 'xp_value', value: parseInt(e.target.value) || 0 })} className="w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Difficulty</label>
                      <select value={template.difficulty_stars} onChange={(e) => updateFieldMutation.mutate({ id: template.id, field: 'difficulty_stars', value: parseInt(e.target.value) })} className="w-full text-sm">
                        {[1,2,3,4,5].map((d) => <option key={d} value={d}>{'\u2B50'.repeat(d)}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}

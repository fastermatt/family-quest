'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { getLevelInfo } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface TaskWithTemplate {
  id: string
  status: string
  xp_awarded: number
  task_template?: {
    name: string
    category: string
    xp_value: number
    difficulty_stars: number
    photo_required: boolean
  }
  photo_challenge_prompt?: string
}

export default function HomePage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [submitTaskId, setSubmitTaskId] = useState<string | null>(null)
  const [photoChallenge, setPhotoChallenge] = useState<string | null>(null)
  const [submittingPhoto, setSubmittingPhoto] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/active-profile')
      if (!res.ok) return null
      return res.json()
    },
  })

  const { data: family } = useQuery({
    queryKey: ['family', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return null
      const { data } = await supabase
        .from('families')
        .select('*')
        .eq('id', profile.family_id)
        .single()
      return data
    },
    enabled: !!profile?.family_id,
  })

  const today = new Date().toISOString().split('T')[0]

  const { data: todayTasks } = useQuery({
    queryKey: ['todayTasks', profile?.id, today],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data: tasks } = await supabase
        .from('task_instances')
        .select('*')
        .eq('assigned_to', profile.id)
        .eq('due_date', today)
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

  const { data: unlockedPrivileges } = useQuery({
    queryKey: ['unlockedPrivileges', profile?.id],
    queryFn: async () => {
      if (!profile?.id || !todayTasks) return []

      const privilegesToCheck = privileges?.filter((p) => {
        if (!p.visible_to?.includes(profile.id) && p.visible_to?.length) {
          return false
        }
        return true
      })

      const unlocked = privilegesToCheck?.filter((p) => {
        if (p.gating_mode === 'always_available') return true
        if (p.gating_mode === 'all_tasks') {
          return todayTasks.every((t) =>
            ['approved', 'submitted'].includes(t.status)
          )
        }
        if (p.gating_mode === 'specific_tasks') {
          return p.required_template_ids?.every(  (templateId: string) =>
            todayTasks.some(
              (t) =>
                t.template_id === templateId &&
                ['approved', 'submitted'].includes(t.status)
            )
          )
        }
        return false
      })

      return unlocked || []
    },
    enabled: !!profile?.id && !!todayTasks,
  })

  const levelInfo = getLevelInfo(profile?.xp_total || 0)

  const completedTasks = todayTasks?.filter((t) =>
    ['approved', 'submitted'].includes(t.status)
  ).length || 0

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({
      taskId,
      file,
      prompt,
    }: {
      taskId: string
      file: File
      prompt: string
    }) => {
      if (!profile?.id) throw new Error('No profile')

      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${profile.id}-${taskId}-${Date.now()}.${fileExt}`
      const filePath = `task-submissions/${profile.family_id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('task-photos')
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('task-photos')
        .getPublicUrl(filePath)

      // Update task instance
      await supabase
        .from('task_instances')
        .update({
          photo_url: data.publicUrl,
          photo_challenge_prompt: prompt,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', taskId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayTasks'] })
      setSubmitTaskId(null)
      setPhotoChallenge(null)
      setSubmittingPhoto(false)
    },
    onError: (error) => {
      console.error('Photo upload failed:', error)
      alert('Photo upload failed. Please try again.')
      setSubmitTaskId(null)
      setPhotoChallenge(null)
      setSubmittingPhoto(false)
    },
  })

  const handleCompleteClick = async (task: TaskWithTemplate) => {
    if (!task.task_template?.photo_required) {
      // No photo required, mark as submitted directly
      uploadPhotoMutation.mutate({
        taskId: task.id,
        file: new File([], 'no-photo'),
        prompt: '',
      })
    } else {
      // Show photo challenge
      setSubmitTaskId(task.id)

      const { data: challenges } = await supabase
        .from('photo_challenges')
        .select('*')

      if (challenges?.length) {
        const randomChallenge =
          challenges[Math.floor(Math.random() * challenges.length)]
        setPhotoChallenge(
          `${randomChallenge.emoji} ${randomChallenge.prompt_text}`
        )
      }
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !submitTaskId || !photoChallenge) return

    setSubmittingPhoto(true)
    uploadPhotoMutation.mutate({
      taskId: submitTaskId,
      file,
      prompt: photoChallenge,
    })
    // Reset the file input so the same file can be re-selected if needed
    event.target.value = ''
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {profile?.avatar_emoji} Hi {profile?.name}! 👋
          </h1>
          <p className="text-white/60 mt-1">
            {family?.name || 'Your Family'}
          </p>
        </div>
        {profile?.current_streak ? (
          <div className="streak-badge">
            🔥 {profile.current_streak}
          </div>
        ) : null}
      </div>

      {/* XP & Level */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/60 text-sm">Total XP</p>
            <p className="text-3xl font-bold text-teal-400">
              {profile?.xp_total || 0}
            </p>
          </div>
          <Badge variant="level">{levelInfo.currentLevel.name}</Badge>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/60">
              {levelInfo.currentLevel.name} → {levelInfo.nextLevel.name}
            </span>
            <span className="text-teal-400">
              {Math.round(levelInfo.progress)}%
            </span>
          </div>
          <ProgressBar
            value={profile?.xp_total || 0}
            max={levelInfo.nextLevel.xpRequired}
          />
        </div>
      </GlassCard>

      {/* Today's Quests */}
      <div>
        <h2 className="text-xl font-bold mb-3">Today's Quests</h2>
        <div className="space-y-3">
          {todayTasks?.map((task) => {
            const isCompleted = ['approved', 'submitted'].includes(
              task.status
            )
            const isPending = task.status === 'pending'

            return (
              <GlassCard
                key={task.id}
                className={`p-4 transition-all ${
                  isCompleted
                    ? 'border-green-400/50 bg-green-500/5'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">
                      {task.task_template?.name}
                    </h3>
                    <div className="flex gap-2 text-sm text-white/60 mb-3">
                      <span>{task.task_template?.category}</span>
                      <span>•</span>
                      <span>{'⭐'.repeat(task.task_template?.difficulty_stars || 1)}</span>
                    </div>

                    <div className="flex gap-2 items-center">
                      <Badge variant="xp">
                        {task.task_template?.xp_value || 0} XP
                      </Badge>
                      {isCompleted && (
                        <Badge variant="approved">Completed</Badge>
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <Button
                      onClick={() => handleCompleteClick(task)}
                      disabled={submitTaskId === task.id && submittingPhoto}
                      size="sm"
                      variant="primary"
                    >
                      {task.task_template?.photo_required
                        ? '📸 Complete'
                        : '✓ Done'}
                    </Button>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </div>

        {!todayTasks?.length && (
          <GlassCard className="p-6 text-center">
            <p className="text-white/60">No quests assigned for today</p>
          </GlassCard>
        )}
      </div>

      {/* Photo Challenge Modal */}
      {submitTaskId && photoChallenge && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-sm p-8 text-center space-y-6">
            <h2 className="text-2xl font-bold">Photo Challenge</h2>

            <div className="text-6xl animate-bounce">
              {photoChallenge.split(' ')[0]}
            </div>

            <p className="text-lg text-white/80">
              {photoChallenge.split(' ').slice(1).join(' ')}
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={submittingPhoto}
                className="w-full"
              >
                📷 Take Photo
              </Button>
              <Button
                onClick={() => {
                  setSubmitTaskId(null)
                  setPhotoChallenge(null)
                }}
                variant="ghost"
                className="w-full"
              >
                Cancel
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
          </GlassCard>
        </div>
      )}

      {/* Privileges */}
      {(privileges?.length || 0) > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-3">Rewards You Can Request</h2>
          <div className="space-y-3">
            {privileges?.map((priv) => {
              const isUnlocked = unlockedPrivileges?.some(
                (u) => u.id === priv.id
              )

              return (
                <GlassCard
                  key={priv.id}
                  className={`p-4 transition-all ${
                    isUnlocked
                      ? 'border-teal-400/50 bg-teal-500/5'
                      : 'border-white/10 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{priv.name}</h3>
                      {priv.description && (
                        <p className="text-sm text-white/60 mt-1">
                          {priv.description}
                        </p>
                      )}
                      {!isUnlocked && priv.gating_mode !== 'always_available' && (
                        <p className="text-xs text-orange-400 mt-2">
                          Complete your quests to unlock
                        </p>
                      )}
                    </div>
                    {isUnlocked && (
                      <Link href="/rewards">
                        <Button size="sm">Request</Button>
                      </Link>
                    )}
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      )}

      {/* Call to Action */}
      {completedTasks === todayTasks?.length && todayTasks?.length > 0 && (
        <Link href="/rewards">
          <Button className="w-full py-4 text-lg">
            🎮 View Your Rewards
          </Button>
        </Link>
      )}
    </div>
  )
}

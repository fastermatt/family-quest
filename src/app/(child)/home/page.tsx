'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Flame, Loader2, Lock, LockOpen, MessageSquare, RotateCcw } from 'lucide-react'
import { ProofIcon, StatusPill, type StatusKey } from '@/components/chores/status'
import { formatClock } from '@/lib/dates'
import { PROOF_META, countsTowardUnlock, isPastCutoff, proofTypeOf, type ProofType } from '@/lib/proof'
import { shrinkPhoto } from '@/lib/image'

interface Chore {
  id: string
  template_id: string
  status: string
  reviewNote: string | null
  prompt: string | null
  task_template: {
    name: string
    proof_type?: ProofType
    photo_required?: boolean
    cutoff_time?: string | null
    required?: boolean
    xp_value: number
  }
}

interface Reward {
  id: string
  name: string
  description: string
  unlocked: boolean
  request: 'pending' | 'approved' | 'denied' | 'conditional' | null
}

interface Today {
  me: { name: string; emoji: string; streak: number; xp: number }
  date: string
  nowMinutes: number
  tasks: Chore[]
  rewards: Reward[]
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong.')
  return body as T
}

function statusOf(c: Chore, nowMinutes: number): StatusKey {
  if (c.status === 'approved') return 'approved'
  if (c.status === 'rejected') return 'rejected'
  if (c.status === 'missed') return 'missed'
  if (c.status === 'submitted') return proofTypeOf(c.task_template) === 'photo' ? 'shown' : 'submitted'
  return isPastCutoff(c.task_template.cutoff_time, nowMinutes) ? 'late' : 'pending'
}

export default function ChildToday() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['child-today'],
    queryFn: () => getJson<Today>('/api/child/today'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const submit = useMutation({
    mutationFn: async ({ id, file }: { id: string; file?: File }) => {
      const form = new FormData()
      form.append('taskId', id)
      const chore = data?.tasks.find((t) => t.id === id)
      if (chore?.prompt) form.append('photoChallengePrompt', chore.prompt)
      if (file) form.append('photo', await shrinkPhoto(file))
      const res = await fetch('/api/submit-task', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'That did not go through. Try again.')
    },
    onMutate: ({ id }) => {
      setBusy(id)
      setError(null)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not go through. Try again.'),
    onSettled: () => {
      setBusy(null)
      qc.invalidateQueries({ queryKey: ['child-today'] })
    },
  })

  const ask = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/child/request-reward/${id}`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not ask right now.')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not ask right now.'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['child-today'] }),
  })

  const start = (c: Chore) => {
    if (proofTypeOf(c.task_template) === 'photo') {
      setPhotoFor(c.id)
      fileRef.current?.click()
    } else {
      submit.mutate({ id: c.id })
    }
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file && photoFor) submit.mutate({ id: photoFor, file })
    setPhotoFor(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading your chores">
        <div className="skeleton h-16" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[76px]" />
        ))}
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <div className="panel p-5 text-[15px]" role="alert">
        <p className="font-semibold">Your chores did not load.</p>
        <p className="mt-1" style={{ color: 'var(--ink-2)' }}>
          Check the Wi-Fi, then close the app and open it again. If it keeps happening, tell Dad.
        </p>
      </div>
    )
  }

  const { me, tasks, rewards, nowMinutes } = data
  const required = tasks.filter((t) => t.task_template.required !== false)
  const shown = required.filter(countsTowardUnlock).length
  const left = required.length - shown
  const allDone = required.length > 0 && left === 0
  const redo = tasks.filter((t) => t.status === 'rejected')

  const weekday = new Date(`${data.date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {weekday}
          </p>
          <h1 className="text-[28px] leading-tight">
            {me.emoji} Hi {me.name}
          </h1>
        </div>
        {me.streak > 0 && (
          <p className="flex items-center gap-1 text-[15px] font-semibold" style={{ color: 'var(--redo)' }}>
            <Flame className="h-4 w-4" aria-hidden />
            {me.streak}-day streak
          </p>
        )}
      </header>

      {required.length > 0 && (
        <section className="panel p-4" aria-label="Progress">
          <div className="flex items-baseline justify-between">
            <p className="text-[17px] font-semibold">
              {allDone ? 'All chores shown' : `${shown} of ${required.length} shown`}
            </p>
            <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
              {allDone ? 'Rewards are open' : `${left} to go`}
            </p>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {required.map((t) => (
              <span
                key={t.id}
                className="h-2 flex-1 rounded-full transition-colors duration-200"
                style={{ background: countsTowardUnlock(t) ? 'var(--ok)' : 'rgba(148,163,184,0.18)' }}
              />
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="row flex items-start gap-2 p-3 text-[15px]" role="alert" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--miss)' }} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {redo.length > 0 && (
        <p className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--redo)' }}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          {redo.length === 1 ? '1 chore was sent back. Read the note and redo it.' : `${redo.length} chores were sent back. Read the notes and redo them.`}
        </p>
      )}

      <section aria-label="Chores">
        <h2 className="mb-3 text-[19px]">Today&apos;s chores</h2>
        {tasks.length === 0 ? (
          <div className="panel p-5 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            Nothing on your list today.
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((c) => {
              const type = proofTypeOf(c.task_template)
              const st = statusOf(c, nowMinutes)
              const open = c.status === 'pending' || c.status === 'rejected'
              const working = busy === c.id
              const cutoff = c.task_template.cutoff_time
              return (
                <li
                  key={c.id}
                  className="row p-3"
                  style={
                    st === 'rejected'
                      ? { borderColor: 'rgba(251,191,36,0.45)' }
                      : st === 'approved' || st === 'shown'
                        ? { opacity: 0.78 }
                        : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                      style={{
                        background: st === 'approved' || st === 'shown' ? 'rgba(52,211,153,0.14)' : 'rgba(148,163,184,0.1)',
                        color: st === 'approved' || st === 'shown' ? 'var(--ok)' : 'var(--ink-2)',
                      }}
                    >
                      {st === 'approved' || st === 'shown' ? <Check className="h-5 w-5" aria-hidden /> : <ProofIcon type={type} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold leading-snug">{c.task_template.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                        <StatusPill status={st} label={st === 'late' && cutoff ? `Late, was due ${formatClock(cutoff)}` : undefined} />
                        {st === 'pending' && cutoff && <span>Due by {formatClock(cutoff)}</span>}
                      </p>
                    </div>
                    {open && (
                      <button
                        type="button"
                        className="btn btn-primary shrink-0"
                        onClick={() => start(c)}
                        disabled={working || !!busy}
                        aria-label={`${PROOF_META[type].action}: ${c.task_template.name}`}
                      >
                        {working ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : type === 'photo' ? (
                          <Camera className="h-4 w-4" aria-hidden />
                        ) : type === 'imessage_video' ? (
                          <MessageSquare className="h-4 w-4" aria-hidden />
                        ) : null}
                        {working ? (type === 'photo' ? 'Sending' : 'Saving') : c.status === 'rejected' ? 'Redo' : type === 'photo' ? 'Photo' : type === 'imessage_video' ? 'Sent it' : 'Done'}
                      </button>
                    )}
                  </div>

                  {open && type === 'photo' && c.prompt && (
                    <p className="mt-2 pl-[52px] text-[14px]" style={{ color: 'var(--ink-2)' }}>
                      Photo: {c.prompt.replace(/^\S+\s/, '')}
                    </p>
                  )}
                  {open && type === 'imessage_video' && (
                    <p className="mt-2 pl-[52px] text-[14px]" style={{ color: 'var(--ink-2)' }}>
                      Record a video, text it to Dad or Mom, then tap Sent it.
                    </p>
                  )}
                  {c.status === 'rejected' && c.reviewNote && (
                    <p className="mt-2 pl-[52px] text-[14px]" style={{ color: 'var(--redo)' }}>
                      “{c.reviewNote}”
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {rewards.length > 0 && (
        <section aria-label="Rewards">
          <h2 className="mb-1 text-[19px]">Rewards</h2>
          <p className="mb-3 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            {allDone ? 'You showed everything. Ask for one.' : 'These open when every chore is shown.'}
          </p>
          <ul className="space-y-2">
            {rewards.map((r) => (
              <li key={r.id} className="row flex items-center gap-3 p-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                  style={{ background: r.unlocked ? 'rgba(45,212,191,0.14)' : 'rgba(148,163,184,0.1)', color: r.unlocked ? 'var(--accent)' : 'var(--ink-3)' }}
                >
                  {r.unlocked ? <LockOpen className="h-5 w-5" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">{r.name}</p>
                  <p className="text-[13px]" style={{ color: r.request === 'approved' ? 'var(--ok)' : r.request === 'denied' ? 'var(--miss)' : 'var(--ink-3)' }}>
                    {r.request === 'approved'
                      ? 'Approved. Enjoy it.'
                      : r.request === 'pending'
                        ? 'Asked. Waiting for a parent.'
                        : r.request === 'denied'
                          ? 'Not today.'
                          : r.unlocked
                            ? 'Open'
                            : `Locked, ${left} chore${left === 1 ? '' : 's'} left`}
                  </p>
                </div>
                {r.unlocked && !r.request && (
                  <button type="button" className="btn btn-quiet shrink-0" onClick={() => ask.mutate(r.id)} disabled={ask.isPending}>
                    Ask
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
    </div>
  )
}

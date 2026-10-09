'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, ExternalLink, Flame, Loader2, Lock, LockOpen, MessageSquare, RotateCcw } from 'lucide-react'
import { FloatChip, IconTile, MuteButton, ParticleBurst, allDoneSeen, markAllDone, useReducedMotion } from '@/components/kid/celebrate'
import { PointsStrip } from '@/components/kid/points-strip'
import { QuestionCard } from '@/components/kid/question-card'
import { TrainingCard } from '@/components/kid/training-card'
import { haptic, playChime, primeAudio, useMuted } from '@/components/kid/sound'
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
    link_url?: string | null
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

const TODAY_KEY = ['child-today']

// Mark one chore as sent, and open rewards if that was the last one needed.
function withSubmitted(d: Today, id: string): Today {
  const tasks = d.tasks.map((t) => (t.id === id ? { ...t, status: 'submitted' } : t))
  const req = tasks.filter((t) => t.task_template.required !== false)
  const all = req.length > 0 && req.every(countsTowardUnlock)
  return { ...d, tasks, rewards: all ? d.rewards.map((r) => (r.unlocked ? r : { ...r, unlocked: true })) : d.rewards }
}

function xpLabel(c: Chore) {
  const xp = c.task_template.xp_value
  return proofTypeOf(c.task_template) === 'photo' ? `+${xp}` : `+${xp} when checked`
}

export default function ChildToday() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<Record<string, true>>({}) // chores finished this session
  const [chips, setChips] = useState<Record<string, string>>({})
  const [announce, setAnnounce] = useState('')
  const [burst, setBurst] = useState(false)
  const [unlockFx, setUnlockFx] = useState(false)
  const prevAll = useRef<boolean | null>(null)
  const reduced = useReducedMotion()
  const [muted, toggleMute] = useMuted()

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: TODAY_KEY,
    queryFn: () => getJson<Today>('/api/child/today'),
    refetchInterval: 20_000, // parent approvals show up quickly
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
    onMutate: async ({ id }) => {
      setBusy(id)
      setError(null)
      await qc.cancelQueries({ queryKey: TODAY_KEY })
      const prev = qc.getQueryData<Today>(TODAY_KEY)
      if (prev) qc.setQueryData<Today>(TODAY_KEY, withSubmitted(prev, id))
      return { prev }
    },
    onError: (e, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODAY_KEY, ctx.prev)
      setFresh(({ [id]: _gone, ...rest }) => rest)
      setChips(({ [id]: _gone, ...rest }) => rest)
      const msg = e instanceof Error ? e.message : ''
      const friendly = /not found/i.test(msg) ? 'That chore was changed by a parent. Your list just refreshed.' : msg || 'That did not go through. Try again.'
      setAnnounce(friendly)
      setError(friendly)
    },
    onSettled: () => {
      setBusy(null)
      qc.invalidateQueries({ queryKey: TODAY_KEY })
    },
  })

  const ask = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/child/request-reward/${id}`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not ask right now.')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not ask right now.'),
    onSettled: () => qc.invalidateQueries({ queryKey: TODAY_KEY }),
  })

  // Derived values the all-done effect needs (hooks must run before early returns).
  const tasksNow = data?.tasks ?? []
  const requiredNow = tasksNow.filter((t) => t.task_template.required !== false)
  const allDoneNow = requiredNow.length > 0 && requiredNow.every(countsTowardUnlock)

  // Fires only on a not-all -> all transition seen this session, once per day.
  useEffect(() => {
    if (!data) return
    const was = prevAll.current
    prevAll.current = allDoneNow
    if (was === null || was || !allDoneNow) return
    if (allDoneSeen(data.date)) return
    markAllDone(data.date)
    playChime('all', 0.35) // queued just behind the single chime
    setUnlockFx(true)
    setBurst(true)
    window.setTimeout(() => setBurst(false), 2000)
  }, [allDoneNow, data])

  const celebrate = (c: Chore) => {
    const xp = c.task_template.xp_value
    setFresh((f) => ({ ...f, [c.id]: true }))
    if (xp > 0) {
      setChips((m) => ({ ...m, [c.id]: xpLabel(c) }))
      // The chip has played by then; take it out of the page.
      window.setTimeout(() => setChips(({ [c.id]: _gone, ...rest }) => rest), 1600)
    }
    setAnnounce(xp > 0 ? `${c.task_template.name} shown. ${xpLabel(c)}` : `${c.task_template.name} shown.`)
    haptic()
    playChime('done')
  }

  const start = (c: Chore) => {
    primeAudio() // unlocks sound while the tap is still fresh
    if (proofTypeOf(c.task_template) === 'photo') {
      setPhotoFor(c.id)
      fileRef.current?.click()
    } else {
      celebrate(c)
      submit.mutate({ id: c.id })
    }
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const chore = data?.tasks.find((t) => t.id === photoFor)
    if (file && chore) {
      celebrate(chore)
      submit.mutate({ id: chore.id, file })
    }
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
  const required = requiredNow
  const shown = required.filter(countsTowardUnlock).length
  const left = required.length - shown
  const allDone = allDoneNow
  const waiting = tasks.filter((t) => t.status === 'submitted').reduce((n, t) => n + (t.task_template.xp_value || 0), 0)
  const anyDone = tasks.some((t) => t.status === 'submitted' || t.status === 'approved')
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
        <div className="flex items-center gap-3">
          {me.streak > 0 && (
            <p className="flex items-center gap-1 text-[15px] font-semibold" style={{ color: 'var(--redo)' }}>
              <Flame className="h-4 w-4" aria-hidden />
              {me.streak}-day streak
            </p>
          )}
          <MuteButton muted={muted} onToggle={toggleMute} />
        </div>
      </header>

      <PointsStrip xp={me.xp} waiting={waiting} reduced={reduced} />

      {required.length > 0 && (
        <section className="panel p-4" aria-label="Progress">
          <p className="flex items-center gap-2 text-[17px] font-semibold">
            {allDone && (
              <span key="done" className={`inline-flex ${unlockFx ? 'fq-pop' : ''}`} style={{ color: 'var(--ok)' }}>
                <Check className="h-5 w-5" aria-hidden />
              </span>
            )}
            {allDone ? 'All chores shown' : `${shown} of ${required.length} shown`}
          </p>
          <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            {allDone ? 'Rewards are open.' : `${left} to go. Rewards unlock at ${required.length}.`}
          </p>
          <div className="mt-3 flex gap-1" aria-hidden>
            {required.map((t) => {
              const counted = countsTowardUnlock(t)
              const sent = t.status === 'submitted'
              return (
                <span
                  key={t.id}
                  className={`fq-seg h-2 flex-1 rounded-full transition-colors duration-200 ${fresh[t.id] ? 'fq-seg-glow' : ''}`}
                  style={{
                    color: counted ? 'var(--ok)' : 'var(--wait)',
                    background: counted ? 'var(--ok)' : sent ? 'rgba(125,211,252,0.45)' : 'rgba(148,163,184,0.18)',
                  }}
                />
              )
            })}
          </div>
        </section>
      )}

      {!allDone && (me.streak >= 3 || (me.streak === 0 && !anyDone)) && (
        <p className="-mt-3 flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: 'var(--redo)' }}>
          <Flame className="h-4 w-4" aria-hidden />
          {me.streak >= 3 ? 'Don\u2019t break your streak.' : 'Start a streak today.'}
        </p>
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
                  className="row relative p-3"
                  style={
                    st === 'rejected'
                      ? { borderColor: 'rgba(251,191,36,0.45)' }
                      : st === 'approved' || st === 'shown'
                        ? { background: 'rgba(52,211,153,0.06)' }
                        : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <IconTile tone={st === 'approved' || st === 'shown' ? 'ok' : st === 'submitted' ? 'wait' : 'idle'} fresh={!!fresh[c.id]}>
                      {st === 'approved' || st === 'shown' || st === 'submitted' ? <Check className="h-5 w-5" aria-hidden /> : <ProofIcon type={type} />}
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold leading-snug">{c.task_template.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                        <StatusPill status={st} label={st === 'late' && cutoff ? `Late, was due ${formatClock(cutoff)}` : undefined} />
                        {st === 'pending' && cutoff && <span>Due by {formatClock(cutoff)}</span>}
                      </p>
                    </div>
                    {(open || working) && (
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
                  {chips[c.id] && <FloatChip text={chips[c.id]} tone={type === 'photo' ? 'ok' : 'wait'} />}

                  {open && c.task_template.link_url && (
                    <a
                      href={c.task_template.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-quiet ml-[52px] mt-2 inline-flex !px-3"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Open the lesson
                    </a>
                  )}
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

      <TrainingCard onPoints={() => qc.invalidateQueries({ queryKey: TODAY_KEY })} />
      <QuestionCard onPoints={() => qc.invalidateQueries({ queryKey: TODAY_KEY })} />

      {rewards.length > 0 && (
        <section aria-label="Rewards">
          <h2 className="mb-1 text-[19px]">Rewards</h2>
          <p className="mb-3 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            {required.length === 0
              ? 'Rewards open once today\'s chores are on your list and shown.'
              : allDone
                ? 'You showed everything. Ask for one.'
                : 'These open when every chore is shown.'}
          </p>
          <ul className="space-y-2">
            {rewards.map((r) => (
              <li key={r.id} className={`row flex items-center gap-3 p-3 ${unlockFx && r.unlocked ? 'fq-unlock' : ''}`}>
                <IconTile tone={r.unlocked ? 'accent' : 'locked'} fresh={unlockFx && r.unlocked}>
                  {r.unlocked ? <LockOpen className="h-5 w-5" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
                </IconTile>
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
                            : required.length === 0
                              ? 'Locked, no chores on your list yet'
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

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {burst && !reduced && <ParticleBurst />}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
    </div>
  )
}

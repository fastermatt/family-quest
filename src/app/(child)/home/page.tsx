'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, ChevronDown, ChevronUp, ExternalLink, Flame, Loader2, Lock, LockOpen, MessageSquare, RotateCcw } from 'lucide-react'
import { FloatChip, IconTile, MuteButton, ParticleBurst, allDoneSeen, markAllDone, useReducedMotion } from '@/components/kid/celebrate'
import { PointsStrip } from '@/components/kid/points-strip'
import { QuestionCard } from '@/components/kid/question-card'
import { TrainingCard } from '@/components/kid/training-card'
import { haptic, playChime, primeAudio, useMuted } from '@/components/kid/sound'
import { ProofIcon, StatusPill, type StatusKey } from '@/components/chores/status'
import { formatClock } from '@/lib/dates'
import { countsTowardUnlock, isPastCutoff, proofTypeOf, type ProofType } from '@/lib/proof'
import { actionLabel, groupChores, isPrivateHost, progressCounts, progressLine } from '@/lib/kid-view'
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
    time_of_day?: string | null
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

function xpLabel(c: Chore) {
  const xp = c.task_template.xp_value
  return proofTypeOf(c.task_template) === 'photo' ? `+${xp}` : `+${xp} when checked`
}

interface RowProps {
  c: Chore
  nowMinutes: number
  fresh: boolean
  chip?: string
  sending: boolean
  locked: boolean // some other chore is being sent
  error?: string
  hasFile: boolean
  onStart: (c: Chore) => void
  onRetry: (c: Chore) => void
  onNewPhoto: (c: Chore) => void
  rowRef: (el: HTMLLIElement | null) => void
  actionRef: (el: HTMLButtonElement | null) => void
}

function ChoreRow({ c, nowMinutes, fresh, chip, sending, locked, error, hasFile, onStart, onRetry, onNewPhoto, rowRef, actionRef }: RowProps) {
  const type = proofTypeOf(c.task_template)
  const st = statusOf(c, nowMinutes)
  const open = c.status === 'pending' || c.status === 'rejected' || c.status === 'missed'
  const cutoff = c.task_template.cutoff_time
  const link = c.task_template.link_url
  const extra = c.task_template.required === false
  const homeOnly = isPrivateHost(link)
  const isRedo = c.status === 'rejected'
  const hasLink = open && !!link && c.status !== 'missed'
  const canAct = open && c.status !== 'missed'
  const showRetry = !!error && type === 'photo' && hasFile
  const label = hasLink && type === 'photo' ? 'Show finished work' : actionLabel(type, c.status)
  const name = c.task_template.name

  const proofBtn = sending ? (
    <button type="button" className="btn btn-primary shrink-0" disabled aria-label={`Sending: ${name}`}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Sending…
    </button>
  ) : canAct && !showRetry ? (
    <button
      ref={actionRef}
      type="button"
      className={`btn shrink-0 ${hasLink ? 'btn-quiet' : 'btn-primary'}`}
      onClick={() => onStart(c)}
      disabled={locked}
      aria-label={`${label}: ${name}`}
    >
      {type === 'photo' ? <Camera className="h-4 w-4" aria-hidden /> : type === 'imessage_video' ? <MessageSquare className="h-4 w-4" aria-hidden /> : null}
      {label}
    </button>
  ) : null

  return (
    <li
      ref={rowRef}
      className="row relative p-3"
      style={isRedo ? { borderColor: 'rgba(251,191,36,0.45)' } : st === 'approved' || st === 'shown' ? { background: 'rgba(52,211,153,0.06)' } : undefined}
    >
      <div className="flex items-center gap-3">
        <IconTile tone={st === 'approved' || st === 'shown' ? 'ok' : st === 'submitted' ? 'wait' : 'idle'} fresh={fresh}>
          {st === 'approved' || st === 'shown' || st === 'submitted' ? <Check className="h-5 w-5" aria-hidden /> : <ProofIcon type={type} />}
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[16px] font-semibold leading-snug">
            {name}
            {extra && (
              <span className="rounded-full border px-2 text-[12px] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
                Extra
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            {st === 'submitted' ? (
              <span className="font-semibold" style={{ color: 'var(--wait)' }}>
                Waiting for Mom or Dad to check
              </span>
            ) : (
              <StatusPill status={st} label={st === 'late' && cutoff ? `Late, was due ${formatClock(cutoff)}` : undefined} />
            )}
            {st === 'pending' && cutoff && <span>Due by {formatClock(cutoff)}</span>}
          </p>
        </div>
        {!hasLink && proofBtn}
      </div>
      {chip && <FloatChip text={chip} tone={type === 'photo' ? 'ok' : 'wait'} />}

      {isRedo && (
        <p className="mt-2 rounded-[10px] px-3 py-2 text-[15px] font-semibold" style={{ color: 'var(--redo)', background: 'rgba(251,191,36,0.1)' }}>
          {c.reviewNote ? <>“{c.reviewNote}”</> : 'Try it again.'}
        </p>
      )}

      {hasLink && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px]">
          <a href={link!} target="_blank" rel="noopener noreferrer" className="btn btn-primary shrink-0">
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open lesson
          </a>
          {proofBtn}
          {homeOnly && (
            <span className="basis-full text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Home Wi-Fi only
            </span>
          )}
        </div>
      )}

      {canAct && type === 'photo' && c.prompt && (
        <p className="mt-2 pl-[52px] text-[14px]" style={{ color: 'var(--ink-2)' }}>
          Photo: {c.prompt.replace(/^\S+\s/, '')}
        </p>
      )}
      {canAct && type === 'imessage_video' && (
        <p className="mt-2 pl-[52px] text-[14px]" style={{ color: 'var(--ink-2)' }}>
          Record a video, text it to Dad or Mom, then tap Sent it.
        </p>
      )}

      {error && (
        <div className="mt-2 pl-[52px]">
          <p className="flex items-start gap-1.5 text-[14px]" role="alert" style={{ color: 'var(--miss)' }}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
          {showRetry && !sending && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" ref={actionRef} className="btn btn-primary" onClick={() => onRetry(c)} disabled={locked} aria-label={`Try again: ${name}`}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Try again
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => onNewPhoto(c)} disabled={locked} aria-label={`Take a new photo: ${name}`}>
                <Camera className="h-4 w-4" aria-hidden />
                Take a new photo
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export default function ChildToday() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const rowEls = useRef(new Map<string, HTMLLIElement>())
  const actionEls = useRef(new Map<string, HTMLButtonElement>())
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [sending, setSending] = useState<Record<string, true>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, File>>({}) // photos that failed to send, for retry
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<Record<string, true>>({}) // chores finished this session
  const [chips, setChips] = useState<Record<string, string>>({})
  const [announce, setAnnounce] = useState('')
  const [burst, setBurst] = useState(false)
  const [unlockFx, setUnlockFx] = useState(false)
  const [showFinished, setShowFinished] = useState(false)
  const prevAll = useRef<boolean | null>(null)
  const reduced = useReducedMotion()
  const [muted, toggleMute] = useMuted()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: TODAY_KEY,
    queryFn: () => getJson<Today>('/api/child/today'),
    refetchInterval: 20_000, // parent approvals show up quickly
    refetchOnWindowFocus: true,
  })

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

  // Nothing is celebrated or changed until the server has saved it.
  const submit = useMutation({
    mutationFn: async ({ chore, file }: { chore: Chore; file?: File }) => {
      const form = new FormData()
      form.append('taskId', chore.id)
      if (chore.prompt) form.append('photoChallengePrompt', chore.prompt)
      if (file) form.append('photo', await shrinkPhoto(file))
      const res = await fetch('/api/submit-task', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'That did not go through. Try again.')
    },
    onMutate: ({ chore }) => {
      setSending((m) => ({ ...m, [chore.id]: true }))
      setRowErrors(({ [chore.id]: _gone, ...rest }) => rest)
      setError(null)
    },
    onSuccess: (_r, { chore }) => {
      setFiles(({ [chore.id]: _gone, ...rest }) => rest)
      celebrate(chore)
      // Returned so "Sending…" stays until the refreshed list lands (no flash back).
      return qc.invalidateQueries({ queryKey: TODAY_KEY })
    },
    onError: (e, { chore }) => {
      const msg = e instanceof Error ? e.message : ''
      const friendly = /not found/i.test(msg) ? 'That chore was changed by a parent. Your list just refreshed.' : msg || 'That did not go through. Try again.'
      setRowErrors((m) => ({ ...m, [chore.id]: friendly }))
      setAnnounce(`${chore.task_template.name}: ${friendly}`)
      qc.invalidateQueries({ queryKey: TODAY_KEY })
    },
    onSettled: (_d, _e, { chore }) => {
      setSending(({ [chore.id]: _gone, ...rest }) => rest)
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

  // Derived from server data only (nothing optimistic feeds this).
  const tasksNow = data?.tasks ?? []
  const prog = progressCounts(tasksNow)
  const allDoneNow = prog.allDone

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

  const submitChore = (c: Chore, file?: File) => {
    primeAudio() // unlocks sound while the tap is still fresh
    if (file) setFiles((m) => ({ ...m, [c.id]: file }))
    submit.mutate({ chore: c, file })
  }

  const newPhoto = (c: Chore) => {
    primeAudio()
    setPhotoFor(c.id)
    fileRef.current?.click()
  }

  const start = (c: Chore) => {
    if (proofTypeOf(c.task_template) === 'photo') newPhoto(c)
    else submitChore(c)
  }

  const retry = (c: Chore) => {
    const file = files[c.id]
    if (file) submitChore(c, file)
    else start(c)
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const chore = data?.tasks.find((t) => t.id === photoFor)
    if (file && chore) submitChore(chore, file)
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

  if (!data) {
    return (
      <div className="panel p-5 text-[15px]" role="alert">
        <p className="font-semibold">Your chores did not load.</p>
        <p className="mt-1" style={{ color: 'var(--ink-2)' }}>
          Check the Wi-Fi, then try again. If it keeps happening, tell Dad.
        </p>
        <button type="button" className="btn btn-primary mt-3" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
          Try again
        </button>
      </div>
    )
  }

  const { me, tasks, rewards, nowMinutes } = data
  const groups = groupChores(tasks, nowMinutes)
  const allDone = prog.allDone
  const hasExtras = tasks.some((t) => t.task_template.required === false)
  const requiredLeft = prog.total - prog.done
  const waitingXp = tasks.filter((t) => t.status === 'submitted').reduce((n, t) => n + (t.task_template.xp_value || 0), 0)
  const anySending = Object.keys(sending).length > 0
  const requiredList = tasks.filter((t) => t.task_template.required !== false)

  const goToFirstFix = () => {
    const first = groups.fix[0]
    if (!first) return
    rowEls.current.get(first.id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    actionEls.current.get(first.id)?.focus({ preventScroll: true })
  }

  const weekday = new Date(`${data.date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  const renderRow = (c: Chore) => (
    <ChoreRow
      key={c.id}
      c={c}
      nowMinutes={nowMinutes}
      fresh={!!fresh[c.id]}
      chip={chips[c.id]}
      sending={!!sending[c.id]}
      locked={anySending}
      error={rowErrors[c.id]}
      hasFile={!!files[c.id]}
      onStart={start}
      onRetry={retry}
      onNewPhoto={newPhoto}
      rowRef={(el) => {
        if (el) rowEls.current.set(c.id, el)
        else rowEls.current.delete(c.id)
      }}
      actionRef={(el) => {
        if (el) actionEls.current.set(c.id, el)
        else actionEls.current.delete(c.id)
      }}
    />
  )

  return (
    <div className="space-y-5 pb-4">
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
            <p className="flex flex-col items-end text-[15px] font-semibold leading-tight" style={{ color: 'var(--redo)' }}>
              <span className="flex items-center gap-1">
                <Flame className="h-4 w-4" aria-hidden />
                {me.streak}-day streak
              </span>
              {!allDone && me.streak >= 3 && <span className="text-[12px] font-medium">Don&rsquo;t break it</span>}
            </p>
          )}
          <MuteButton muted={muted} onToggle={toggleMute} />
        </div>
      </header>

      <PointsStrip xp={me.xp} waiting={waitingXp} reduced={reduced} />

      {prog.total > 0 && (
        <section className="panel p-3" aria-label="Progress">
          <p className="flex items-center gap-2 text-[16px] font-semibold">
            {allDone && (
              <span key="done" className={`inline-flex ${unlockFx ? 'fq-pop' : ''}`} style={{ color: 'var(--ok)' }}>
                <Check className="h-5 w-5" aria-hidden />
              </span>
            )}
            {progressLine(prog)}
          </p>
          {!allDone && (
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Photos count when sent. Video and check-off chores count after Mom or Dad checks them.
            </p>
          )}
          <div className="mt-2 flex gap-1" aria-hidden>
            {requiredList.map((t) => {
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

      {error && (
        <div className="row flex items-start gap-2 p-3 text-[15px]" role="alert" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--miss)' }} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {groups.fix.length > 0 && (
        <button
          type="button"
          onClick={goToFirstFix}
          className="flex min-h-[44px] w-full items-center gap-2 text-left text-[15px] font-semibold"
          style={{ color: 'var(--redo)' }}
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
          {groups.fix.length === 1 ? '1 chore was sent back. Read the note and redo it.' : `${groups.fix.length} chores were sent back. Read the notes and redo them.`}
        </button>
      )}

      {tasks.length === 0 && (
        <div className="panel p-5 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Nothing on your list today.
        </div>
      )}

      {groups.fix.length > 0 && (
        <section aria-labelledby="g-fix">
          <h2 id="g-fix" className="mb-2 text-[19px]" style={{ color: 'var(--redo)' }}>
            Fix these
          </h2>
          <ul className="space-y-2">{groups.fix.map(renderRow)}</ul>
        </section>
      )}

      {groups.next.length > 0 && (
        <section aria-labelledby="g-next">
          <h2 id="g-next" className="mb-2 text-[19px]">
            Do next
          </h2>
          <ul className="space-y-2">{groups.next.map(renderRow)}</ul>
        </section>
      )}

      {groups.waiting.length > 0 && (
        <section aria-labelledby="g-wait">
          <h2 id="g-wait" className="mb-2 text-[19px]">
            Waiting on Mom or Dad
          </h2>
          <ul className="space-y-2">{groups.waiting.map(renderRow)}</ul>
        </section>
      )}

      {groups.finished.length > 0 && (
        <section aria-label="Finished chores">
          <button
            type="button"
            className="btn btn-quiet w-full justify-between"
            aria-expanded={showFinished}
            aria-controls="finished-list"
            onClick={() => setShowFinished((v) => !v)}
          >
            <span>Finished ({groups.finished.length})</span>
            {showFinished ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </button>
          {showFinished && (
            <ul id="finished-list" className="mt-2 space-y-2">
              {groups.finished.map(renderRow)}
            </ul>
          )}
        </section>
      )}

      {rewards.length > 0 && (
        <section aria-label="Rewards">
          <h2 className="mb-1 text-[19px]">Rewards</h2>
          <p className="mb-3 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            {prog.total === 0
              ? 'Rewards open once today\'s chores are on your list and shown.'
              : allDone
                ? 'You showed everything. Ask for one.'
                : `These open when ${hasExtras ? 'all required chores are' : 'every chore is'} shown.`}
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
                            : prog.total === 0
                              ? 'Locked, no chores on your list yet'
                              : `Locked, ${requiredLeft} ${hasExtras ? 'required ' : ''}chore${requiredLeft === 1 ? '' : 's'} left`}
                  </p>
                </div>
                {r.unlocked && !r.request && (
                  <button type="button" className="btn btn-primary shrink-0" onClick={() => ask.mutate(r.id)} disabled={ask.isPending}>
                    Ask
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="g-extra">
        <h2 id="g-extra" className="text-[19px]">
          Extra sparks
        </h2>
        <p className="mb-3 text-[14px]" style={{ color: 'var(--ink-2)' }}>
          Optional. Earn bonus points.
        </p>
        <div className="space-y-2">
          <TrainingCard onPoints={() => qc.invalidateQueries({ queryKey: TODAY_KEY })} />
          <QuestionCard onPoints={() => qc.invalidateQueries({ queryKey: TODAY_KEY })} />
        </div>
      </section>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {burst && !reduced && <ParticleBurst />}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
    </div>
  )
}

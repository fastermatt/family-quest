'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { AlarmClock, AlertTriangle, Check, Dumbbell, Flame, Lightbulb, Trophy, Loader2, MessageSquare, Plus, RotateCcw } from 'lucide-react'
import { ProofIcon, StatusPill, type StatusKey } from './status'
import { formatClock } from '@/lib/dates'
import { choresLeft, isCrunchTime } from '@/lib/kid-view'
import { countsTowardUnlock, isPastCutoff, proofTypeOf, type ProofType } from '@/lib/proof'

interface Task {
  id: string
  childId: string
  status: string
  dueDate: string
  submittedAt: string | null
  reviewNote: string | null
  hasPhoto: boolean
  prompt: string | null
  answers?: { q: string; a: string }[] | null
  template: { name: string; proof_type?: ProofType; photo_required?: boolean; cutoff_time?: string | null; required?: boolean; xp_value: number } | null
}

interface TrainingLog {
  day: string
  restDay: boolean
  skills: string[]
  workedOn: string | null
  winPrompt: string | null
  win: string | null
}

interface Overview {
  me: { name: string }
  family: { name: string }
  date: string
  nowMinutes: number
  children: {
    id: string
    name: string
    emoji: string
    streak: number
    tasks: Task[]
    question?: string
    reflections?: { day: string; question: string; answer: string }[]
    training?: TrainingLog[]
  }[]
  olderWaiting: Task[]
  requests: { id: string; childId: string; reward: string }[]
}

const QUICK_NOTES = ['Not finished yet', 'Photo does not show it', 'Show the finished result']

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'That did not save. Try again.')
  return json
}

function statusOf(t: Task, nowMinutes: number, isToday: boolean): StatusKey {
  if (t.status === 'approved') return 'approved'
  if (t.status === 'rejected') return 'rejected'
  if (t.status === 'missed') return 'missed'
  if (t.status === 'submitted') return 'submitted'
  return isToday && isPastCutoff(t.template?.cutoff_time, nowMinutes) ? 'late' : 'pending'
}

function timeAgo(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
}

export function ParentToday() {
  const qc = useQueryClient()
  const [sendingBack, setSendingBack] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['parent-overview'],
    queryFn: async () => {
      const res = await fetch('/api/parent/overview', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not load today.')
      return json as Overview
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const review = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      post(`/api/parent/review/${id}`, { action, note }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setSendingBack(null)
      setNote('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not save.'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['parent-overview'] }),
  })

  const answer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deny' }) => post(`/api/parent/requests/${id}`, { action }),
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not save.'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['parent-overview'] }),
  })

  const approveAll = useMutation({
    mutationFn: async () => {
      const ids = (qc.getQueryData<Overview>(['parent-overview'])?.children ?? [])
        .flatMap((c) => c.tasks)
        .concat(qc.getQueryData<Overview>(['parent-overview'])?.olderWaiting ?? [])
        .filter((t) => t.status === 'submitted' && t.hasPhoto && proofTypeOf(t.template) === 'photo')
        .map((t) => t.id)
      let ok = 0
      for (const id of ids) {
        // One at a time so points and streaks add up in order; skip any already reviewed.
        try {
          await post(`/api/parent/review/${id}`, { action: 'approve' })
          ok++
        } catch (e) {
          if (e instanceof Error && /Already reviewed/.test(e.message)) ok++
        }
      }
      return { ok, total: ids.length }
    },
    onSuccess: ({ ok, total }) => {
      if (ok < total) setError(`Approved ${ok} of ${total}. ${total - ok} did not go through, try those one at a time.`)
    },
    onMutate: () => setError(null),
    onError: (e) => setError(e instanceof Error ? e.message : 'Some approvals did not save.'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['parent-overview'] }),
  })

  // Normally the 5am job does this; this is the manual fallback.
  const makeList = useMutation({
    mutationFn: () => post('/api/generate-task-instances', {}),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not make the list.'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['parent-overview'] }),
  })

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading today">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-40" />
        <div className="skeleton h-56" />
      </div>
    )
  }
  if (loadError || !data) {
    return (
      <div className="panel p-5" role="alert">
        <p className="font-semibold">Today did not load.</p>
        <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          {loadError instanceof Error ? loadError.message : 'Check your connection and reload.'}
        </p>
      </div>
    )
  }

  const nameOf = (id: string) => data.children.find((c) => c.id === id)?.name ?? 'Kid'
  const waiting = [
    ...data.children.flatMap((c) => c.tasks.filter((t) => t.status === 'submitted')),
    ...data.olderWaiting,
  ].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')) // oldest first
  const dateLabel = new Date(`${data.date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  const busyId = review.isPending ? review.variables?.id : null

  // Busy parent shortcut: photos already show the work, so approve them in one tap.
  const photosWaiting = waiting.filter((t) => proofTypeOf(t.template) === 'photo' && t.hasPhoto)

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {dateLabel}
          </p>
          <h1 className="text-[28px] leading-tight">Today</h1>
        </div>
        <Link href="/tasks?new=1" className="btn btn-quiet">
          <Plus className="h-4 w-4" aria-hidden />
          Add a chore
        </Link>
      </header>

      {error && (
        <div className="row flex items-start gap-2 p-3 text-[15px]" role="alert" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--miss)' }} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* What needs a parent, first. */}
      <section aria-labelledby="needs-you">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="needs-you" className="text-[19px]">
            {waiting.length + data.requests.length > 0 ? `Needs you (${waiting.length + data.requests.length})` : 'Needs you'}
          </h2>
          {photosWaiting.length >= 2 && (
            <button type="button" className="btn btn-quiet" disabled={approveAll.isPending || review.isPending} onClick={() => approveAll.mutate()}>
              {approveAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Approve all {photosWaiting.length} photos
            </button>
          )}
        </div>

        {waiting.length + data.requests.length === 0 ? (
          <p className="panel p-4 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            Nothing to review right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {waiting.map((t) => {
              const type = proofTypeOf(t.template)
              const isBack = sendingBack === t.id
              const working = busyId === t.id
              return (
                <li key={t.id} className="panel p-4">
                  <div className="flex gap-4">
                    {type === 'photo' && t.hasPhoto ? (
                      <button
                        type="button"
                        onClick={() => setZoom(zoom === t.id ? null : t.id)}
                        className="shrink-0 overflow-hidden rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ outlineColor: 'var(--accent)' }}
                        aria-label={zoom === t.id ? 'Shrink photo' : 'Enlarge photo'}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/proof/${t.id}`}
                          alt={`Proof for ${t.template?.name ?? 'chore'}`}
                          width={88}
                          height={88}
                          className="h-[88px] w-[88px] object-cover"
                          style={{ background: 'var(--surface-2)' }}
                        />
                      </button>
                    ) : (
                      <span
                        className="flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] text-center text-[12px]"
                        style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
                      >
                        <ProofIcon type={type} className="h-6 w-6" />
                        {type === 'imessage_video' ? 'In Messages' : type === 'written' ? 'Wrote it' : 'Says done'}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold leading-snug">{t.template?.name ?? 'Chore'}</p>
                      <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                        {nameOf(t.childId)} · {t.dueDate !== data.date ? `from ${t.dueDate.slice(5).replace('-', '/')}` : `sent ${timeAgo(t.submittedAt)}`}
                      </p>
                      {type === 'imessage_video' && (
                        <p className="mt-1 flex items-center gap-1 text-[14px]" style={{ color: 'var(--wait)' }}>
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                          Watch his video in Messages, then approve.
                        </p>
                      )}
                      {type === 'check' && (
                        <p className="mt-1 text-[14px]" style={{ color: 'var(--wait)' }}>
                          Check it yourself, then approve.
                        </p>
                      )}
                      {type === 'photo' && t.prompt && (
                        <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                          Asked for: {t.prompt.replace(/^\S+\s/, '')}
                        </p>
                      )}
                    </div>
                  </div>

                  {type === 'written' && t.answers?.length ? (
                    <dl className="mt-3 space-y-2 rounded-[10px] p-3" style={{ background: 'var(--surface-2)' }}>
                      {t.answers.map((x, i) => (
                        <div key={i}>
                          <dt className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                            {x.q}
                          </dt>
                          <dd className="whitespace-pre-wrap text-[15px]" style={{ color: 'var(--ink)' }}>
                            “{x.a}”
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {zoom === t.id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/proof/${t.id}`} alt={`Proof for ${t.template?.name ?? 'chore'}, large`} className="mt-3 w-full rounded-[10px]" />
                  )}

                  {isBack ? (
                    <div className="mt-4 space-y-3">
                      <label htmlFor={`note-${t.id}`} className="block text-[14px] font-semibold">
                        What needs fixing?
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_NOTES.map((q) => (
                          <button key={q} type="button" className="btn btn-quiet !px-3 text-[14px]" onClick={() => setNote(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                      <textarea
                        id={`note-${t.id}`}
                        className="field min-h-[80px] py-2"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Be specific: take a wider photo showing the whole worksheet"
                        maxLength={300}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-primary flex-1"
                          disabled={!note.trim() || working}
                          onClick={() => review.mutate({ id: t.id, action: 'reject', note })}
                        >
                          {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                          Send back
                        </button>
                        <button type="button" className="btn btn-quiet" onClick={() => { setSendingBack(null); setNote('') }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary flex-1"
                        disabled={working}
                        onClick={() => review.mutate({ id: t.id, action: 'approve' })}
                      >
                        {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                        {type === 'imessage_video' ? 'Got the video, approve' : type === 'written' ? 'Read it, approve' : 'Approve'}
                      </button>
                      <button type="button" className="btn btn-quiet" disabled={working} onClick={() => { setSendingBack(t.id); setNote('') }}>
                        Send back
                      </button>
                    </div>
                  )}
                </li>
              )
            })}

            {data.requests.map((r) => (
              <li key={r.id} className="panel flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">{r.reward}</p>
                  <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
                    {nameOf(r.childId)} is asking. His chores are shown.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-primary" disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, action: 'approve' })}>
                    Yes
                  </button>
                  <button type="button" className="btn btn-quiet" disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, action: 'deny' })}>
                    Not today
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.children.map((child) => {
        const done = child.tasks.filter((t) => countsTowardUnlock({ id: t.id, status: t.status, task_template: t.template ?? undefined })).length
        return (
          <section key={child.id} aria-labelledby={`kid-${child.id}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id={`kid-${child.id}`} className="text-[19px]">
                {child.emoji} {child.name}&apos;s day
              </h2>
              <p className="flex items-center gap-3 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {child.tasks.length > 0 && <span>{done} of {child.tasks.length} shown</span>}
                {child.streak > 0 && (
                  <span className="flex items-center gap-1" style={{ color: 'var(--redo)' }}>
                    <Flame className="h-3.5 w-3.5" aria-hidden />
                    {child.streak}
                  </span>
                )}
              </p>
            </div>
            {(() => {
              const left = choresLeft(child.tasks.map((t) => ({ id: t.id, status: t.status, task_template: { required: t.template?.required } })))
              if (!isCrunchTime(data.nowMinutes, left)) return null
              return (
                <p
                  role="status"
                  className="mb-3 flex items-center gap-2 rounded-[12px] border-2 px-4 py-3 text-[16px] font-bold"
                  style={{ borderColor: 'var(--miss)', background: 'rgba(251,113,133,0.12)', color: 'var(--miss)' }}
                >
                  <AlarmClock className="h-5 w-5 shrink-0" aria-hidden />
                  After 4 PM: {child.name} still has {left} chore{left === 1 ? '' : 's'} to do.
                </p>
              )
            })()}
            {child.tasks.length === 0 ? (
              <p className="panel p-4 text-[15px]" style={{ color: 'var(--ink-2)' }}>
                Nothing on {child.name}&apos;s list today.{' '}
                <button type="button" className="underline underline-offset-2" onClick={() => makeList.mutate()} disabled={makeList.isPending}>
                  {makeList.isPending ? 'Making it…' : 'Make today’s list now'}
                </button>{' '}
                or <Link href="/tasks" className="underline underline-offset-2">add chores</Link>.
              </p>
            ) : (
              <ul className="panel divide-y" style={{ borderColor: 'var(--line)' }}>
                {child.tasks.map((t) => {
                  const st = statusOf(t, data.nowMinutes, true)
                  const cutoff = t.template?.cutoff_time
                  return (
                    <li key={t.id} className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                      <div className="flex items-center gap-3">
                        <span style={{ color: 'var(--ink-3)' }}>
                          <ProofIcon type={proofTypeOf(t.template)} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px]">{t.template?.name}</span>
                        {cutoff && st === 'pending' && (
                          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                            by {formatClock(cutoff)}
                          </span>
                        )}
                        <StatusPill status={st} />
                      </div>
                      {t.answers?.length && (t.status === 'approved' || t.status === 'submitted') ? (
                        <dl className="mt-2 space-y-1.5 pl-7">
                          {t.answers.map((x, i) => (
                            <div key={i}>
                              <dt className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{x.q}</dt>
                              <dd className="whitespace-pre-wrap text-[14px]" style={{ color: 'var(--ink-2)' }}>“{x.a}”</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            <Training child={child} today={data.date} />
            <Reflections child={child} today={data.date} />
          </section>
        )
      })}
    </div>
  )
}

function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Today's question and the child's answer, with the last two weeks below. */
function Reflections({ child, today }: { child: Overview['children'][number]; today: string }) {
  const all = child.reflections ?? []
  const todays = all.find((r) => r.day === today)
  const past = all.filter((r) => r.day !== today)
  return (
    <div className="panel mt-3 p-4">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
        <Lightbulb className="h-3.5 w-3.5" aria-hidden />
        Question of the day
      </p>
      <p className="mt-1 text-[15px] font-semibold">{todays?.question ?? child.question}</p>
      {todays ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[15px]" style={{ color: 'var(--ink-2)' }}>
          “{todays.answer}”
        </p>
      ) : (
        <p className="mt-1.5 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          {child.name} has not answered yet.
        </p>
      )}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[14px] font-semibold" style={{ color: 'var(--accent)' }}>
            Past answers ({past.length})
          </summary>
          <ul className="mt-2 space-y-3">
            {past.map((r) => (
              <li key={r.day}>
                <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  {shortDay(r.day)} · {r.question}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[15px]" style={{ color: 'var(--ink-2)' }}>
                  “{r.answer}”
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function LogLines({ log }: { log: TrainingLog }) {
  if (log.restDay) return <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>Rest day{log.win ? `: ${log.win}` : '.'}</p>
  return (
    <div className="space-y-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
      {log.skills.length > 0 && <p className="font-semibold" style={{ color: 'var(--ink)' }}>{log.skills.join(' · ')}</p>}
      {log.workedOn && <p>{log.workedOn}</p>}
      {log.win && (
        <p className="flex items-start gap-1.5">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--redo)' }} aria-hidden />
          <span>
            {log.winPrompt && <span style={{ color: 'var(--ink-3)' }}>{log.winPrompt} </span>}
            “{log.win}”
          </span>
        </p>
      )}
    </div>
  )
}

/** The child's calisthenics log for today, with the last two weeks below. */
function Training({ child, today }: { child: Overview['children'][number]; today: string }) {
  const all = child.training ?? []
  const todays = all.find((r) => r.day === today)
  const past = all.filter((r) => r.day !== today)
  const trainedDays = all.filter((r) => !r.restDay).length
  return (
    <div className="panel mt-3 p-4">
      <p className="flex items-center justify-between gap-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
        <span className="flex items-center gap-1.5">
          <Dumbbell className="h-3.5 w-3.5" aria-hidden />
          Calisthenics
        </span>
        {trainedDays > 0 && <span className="normal-case tracking-normal">{trainedDays} training day{trainedDays === 1 ? '' : 's'} in 2 weeks</span>}
      </p>
      <div className="mt-1.5">
        {todays ? (
          <LogLines log={todays} />
        ) : (
          <p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>
            {child.name} has not logged training today.
          </p>
        )}
      </div>
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[14px] font-semibold" style={{ color: 'var(--accent)' }}>
            Past training ({past.length})
          </summary>
          <ul className="mt-2 space-y-3">
            {past.map((r) => (
              <li key={r.day}>
                <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{shortDay(r.day)}</p>
                <LogLines log={r} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

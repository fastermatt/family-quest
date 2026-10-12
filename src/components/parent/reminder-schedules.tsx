'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatClock } from '@/lib/dates'
import type { ReminderSchedule } from '@/lib/reminder-schedule'

export function ReminderTimesEditor({ name, schedules, busy, onChange }: { name: string; schedules: ReminderSchedule[]; busy: boolean; onChange: (method: 'POST' | 'PATCH' | 'DELETE', values: { id?: string; time?: string; enabled?: boolean }) => Promise<void> }) {
  const [time, setTime] = useState('15:00')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function change(method: 'POST' | 'PATCH' | 'DELETE', values: { id?: string; time?: string; enabled?: boolean }) {
    setError(''); setMessage('')
    try { await onChange(method, values); setMessage(method === 'DELETE' ? 'Reminder removed.' : 'Reminder saved.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }
  return <section className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }} aria-label={`Reminder times for ${name}`}>
    <h3 className="text-[17px] font-semibold">Chore reminder times</h3>
    <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>Every day · Denver time. Add as many times as you need. Each reminder shows required chores left, or encouragement when there’s nothing left to do.</p>
    <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>On {name}’s iPhone, add ChoreZap to the Home Screen, open it there, and turn on reminders. These times use ChoreZap notifications.</p>
    <ul className="mt-3 space-y-3">{schedules.map(s => <li key={s.id} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`reminder-${s.id}`}>Reminder time {formatClock(s.time)}</label>
      <input className="field w-auto" id={`reminder-${s.id}`} type="time" defaultValue={s.time} key={`${s.id}-${s.time}`} disabled={busy} onBlur={e => { if (e.target.value && e.target.value !== s.time) void change('PATCH', { ...s, time: e.target.value }) }} />
      <button className="btn btn-quiet" type="button" disabled={busy} aria-label={`${s.enabled ? 'Pause' : 'Resume'} ${formatClock(s.time)} reminder`} onClick={() => void change('PATCH', { ...s, enabled: !s.enabled })}>{s.enabled ? 'On · Pause' : 'Paused · Resume'}</button>
      <button className="btn btn-quiet" type="button" disabled={busy} aria-label={`Remove ${formatClock(s.time)} reminder`} onClick={() => void change('DELETE', { id: s.id })}>Remove</button>
    </li>)}</ul>
    {!schedules.length && <p className="mt-3 text-[14px]">No custom reminder times yet.</p>}
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void change('POST', { time, enabled: true }) }}>
      <div><label className="mb-1 block text-[14px]" htmlFor={`new-reminder-${name}`}>New daily reminder</label><input className="field w-auto" id={`new-reminder-${name}`} type="time" required value={time} disabled={busy} onChange={e => setTime(e.target.value)} /></div>
      <button className="btn btn-primary" disabled={busy || !time} type="submit">{busy ? 'Saving…' : 'Add reminder'}</button>
    </form>
    {message && <p className="mt-2 text-[14px]" role="status">{message}</p>}{error && <p className="mt-2 text-[14px]" role="alert" style={{ color: 'var(--miss)' }}>{error}</p>}
    <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-2)' }}>Submitted chores count as awaiting review. Bonus chores are optional. Existing family-wide reminders still apply.</p>
  </section>
}

export function ChildReminderSchedules({ childId, name }: { childId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const key = ['reminder-schedules', childId]
  const query = useQuery({ queryKey: key, enabled: open, queryFn: async () => {
    const response = await fetch(`/api/parent/reminder-schedules?childId=${encodeURIComponent(childId)}`, { cache: 'no-store' })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'Could not load reminders.')
    return json.schedules as ReminderSchedule[]
  } })
  const save = useMutation({ mutationFn: async ({ method, values }: { method: 'POST' | 'PATCH' | 'DELETE'; values: { id?: string; time?: string; enabled?: boolean } }) => {
    const response = await fetch('/api/parent/reminder-schedules', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, childId }) })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'Could not save reminders.')
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: key }) } })
  return <div className="mt-3"><button className="btn btn-quiet" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide reminder times' : 'Set reminder times'}</button>
    {open && query.isPending && <p className="mt-2" role="status">Loading reminder times…</p>}
    {open && query.error && <div role="alert"><p>{query.error.message}</p><button className="btn btn-quiet" onClick={() => void query.refetch()}>Try again</button></div>}
    {open && query.data && <ReminderTimesEditor name={name} schedules={query.data} busy={save.isPending} onChange={(method, values) => save.mutateAsync({ method, values })} />}
  </div>
}

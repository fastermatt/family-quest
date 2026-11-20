'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

type Event = { id: string; kind: 'stop_requested' | 'checkin_missing' | 'checkin_restored'; occurred_at: string; device_name: string }
type Presence = { enabled: boolean; thresholdMinutes: number; events: Event[]; deliveryNote: string }
const label: Record<Event['kind'], string> = {
  stop_requested: 'Stop requested',
  checkin_missing: 'PC check-ins missing',
  checkin_restored: 'PC check-ins resumed',
}
const denverTime = (value: string) => new Date(value).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function DevicePresence({ childId }: { childId: string }) {
  const qc = useQueryClient()
  const [desired, setDesired] = useState<boolean | null>(null)
  const key = ['pc-presence', childId]
  const q = useQuery<Presence>({ queryKey: key, enabled: !!childId, queryFn: async () => {
    const r = await fetch(`/api/parent/companion/presence?childId=${encodeURIComponent(childId)}`, { cache: 'no-store' })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.error || 'Could not load tracking notices.')
    return body
  }, refetchInterval: 30_000 })
  const save = useMutation({ mutationFn: async (enabled: boolean) => {
    const r = await fetch('/api/parent/companion/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ childId, enabled }) })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.error || 'Could not save tracking notices.')
    return body
  }, onSuccess: async (_result, enabled) => {
    qc.setQueryData<Presence>(key, current => current ? { ...current, enabled } : current)
    await qc.invalidateQueries({ queryKey: key })
    setDesired(null)
  }, onError: () => setDesired(null) })
  return <section className="panel space-y-3 p-4" aria-label="Tracking check-in notices">
    <h2 className="text-[18px] font-semibold">Tracking check-in notices</h2>
    <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Choose whether to get a notice if this PC stops checking in. A missed check-in can mean sleep, power loss, or network trouble. A stop request does not prove the app exited.</p>
    {q.isPending ? <p role="status">Loading notice setting…</p> : q.isError ? <p role="alert">{q.error.message} <button className="btn btn-quiet" onClick={() => void q.refetch()}>Retry</button></p> : q.data && <>
      <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" className="mt-1" checked={desired ?? q.data.enabled} disabled={save.isPending} onChange={e => { setDesired(e.target.checked); save.mutate(e.target.checked) }} /><span>Notify me when tracking stops checking in</span></label>
      <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>A missing check-in is recorded after {q.data.thresholdMinutes} minutes. Push notices need browser permission; these events remain visible here.</p>
      {q.data.deliveryNote && <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{q.data.deliveryNote}</p>}
      <div><h3 className="text-[14px] font-semibold">Recent events</h3>{!q.data.events.length ? <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>No tracking events recorded yet.</p> : <ol className="mt-2 space-y-2">{[...q.data.events].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, 20).map(event => <li className="row p-3 text-[13px]" key={event.id}><strong>{label[event.kind] || 'Tracking event'}</strong><p>{event.device_name} · <time dateTime={event.occurred_at}>{denverTime(event.occurred_at)}</time></p></li>)}</ol>}</div>
    </>}
    {save.isError && <p role="alert" className="text-[13px]">{save.error.message} The setting was not confirmed. Try again.</p>}
  </section>
}

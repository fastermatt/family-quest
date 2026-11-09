'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Brand } from '@/components/brand'
import type { FamilyOverview, FamilySettings, JobOffer } from '@/lib/family-controls/types'
import { centsFrom, clock, duration, money, postJson, WindowEditor } from './shared'

type Data = { children: { id: string; name: string }[]; privileges?: { id: string; name: string }[]; overview: FamilyOverview | null }
const key = ['family-controls-parent']
type PendingSettlement = { childId: string; amountCents: number; requestId: string }
const settlementStorageKey = (childId: string) => `family-controls-pending-settlement:${childId}`
function readPending(childId: string): PendingSettlement | null {
  try {
    const raw = sessionStorage.getItem(settlementStorageKey(childId))
    if (!raw) return null
    const value = JSON.parse(raw) as PendingSettlement
    if (value?.childId === childId && Number.isSafeInteger(value.amountCents) && value.amountCents > 0 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId)) return value
    clearPending(childId)
    return null
  } catch { clearPending(childId); return null }
}
function savePending(value: PendingSettlement): boolean {
  try { sessionStorage.setItem(settlementStorageKey(value.childId), JSON.stringify(value)); return true } catch { return false }
}
function clearPending(childId: string) { try { sessionStorage.removeItem(settlementStorageKey(childId)) } catch { /* best effort after a confirmed save */ } }
function needsAgentUpdate(version: string | null) {
  if (!version) return false
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return false
  const major = Number(match[1]), minor = Number(match[2])
  return major === 0 && minor < 3
}
export function FamilyControlsParent() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const q = useQuery<Data>({ queryKey: [...key, selected], queryFn: async () => { const r = await fetch(`/api/parent/family-controls${selected ? `?childId=${encodeURIComponent(selected)}` : ''}`, { cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load family controls.'); return d }, refetchInterval: 30_000 })
  const save = useMutation({ mutationFn: ({ childId, ...body }: Record<string, unknown> & { childId: string }) => postJson('/api/parent/family-controls', { childId, ...body }), onSuccess: (_result, variables) => { if (variables.action === 'settle-cash') clearPending(variables.childId); setNotice('Saved. Connected PCs receive updates when they check in.'); void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['my-family-controls'] }) }, onError: (e: Error) => { setNotice(e.message); if (e.message.includes('Refresh')) void qc.invalidateQueries({ queryKey: key }) } })
  const d = q.data, o = d?.overview, id = o?.childId
  const act = (body: Record<string, unknown>, onSuccess?: () => void) => { if (id) { setNotice(''); save.mutate({ childId: id, ...body }, { onSuccess }) } }
  return <div className="space-y-6 pb-8"><Brand /><header><h1 className="mt-5 text-[30px] font-bold">Family game time & jobs</h1><p style={{ color: 'var(--ink-2)' }}>A cooperative PC pilot for game time earned after responsibilities, with optional paid work.</p></header>
    {q.isPending ? <p role="status">Loading family controls…</p> : q.isError ? <section className="panel p-4" role="alert">{(q.error as Error).message} <button className="btn btn-quiet ml-2" onClick={() => void q.refetch()}>Retry</button></section> : <>
      <label className="block">Child<select className="field mt-2" value={id || ''} onChange={e => { setSelected(e.target.value); setNotice('') }}>{d?.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {notice && <p className="panel p-3 text-[14px]" role={save.isError ? 'alert' : 'status'}>{notice}</p>}
      {!o ? <p>Add a child in Family first.</p> : <>
        <section className="panel space-y-2 p-5"><h2 className="text-[20px] font-semibold">Today · {o.day}</h2><p><strong>{duration(o.game.remainingSeconds)}</strong> game time left from {duration(o.game.grantedSeconds)} earned, based on the last PC upload.</p><p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{o.game.reason}</p><p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{o.game.remainingTasks} of {o.game.requiredCount} required responsibilities still need completion or review. School and YouTube do not use game minutes.</p><p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>PC activity can be about five minutes behind. Applies to classified games while the pilot app is running; this is not native filtering or a whole PC bedtime lock.</p></section>
        <SettingsEditor key={`${id}-${o.settings.revision}`} initial={o.settings} privileges={d?.privileges || []} busy={save.isPending} onSave={settings => act({ action: 'settings', settings })} />
        <MoneyPanel key={id} overview={o} busy={save.isPending} onAction={act} />
        <section className="panel space-y-2 p-4"><h2 className="text-[18px] font-semibold">Connected PCs</h2><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>One linked active PC per child in this pilot. If another PC is linked, game time pauses until you unlink the extra account from PC time.</p>{o.devices.length ? o.devices.map(dev => <p key={dev.id} className="text-[14px]">{dev.name} · {dev.last_seen_at ? `Last seen ${clock(dev.last_seen_at)}` : 'Waiting for first check-in'} · {dev.applied_at ? `Settings revision ${dev.applied_revision ?? 'unknown'} acknowledged ${clock(dev.applied_at)}${dev.applied_revision === o.settings.revision ? '' : `; current revision ${o.settings.revision} awaits acknowledgement`}` : `Current settings revision ${o.settings.revision} awaits acknowledgement`}{needsAgentUpdate(dev.version) ? ' · Update the PC app to version 0.3.0 or newer for these rules.' : ''}</p>) : <p className="text-[14px]">No linked PC yet. Link one from PC time.</p>}<p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Acknowledged settings do not confirm fresh chore or usage data.</p><a className="btn btn-quiet" href="/pc">PC time & linking</a></section>
      </>}
    </>}
  </div>
}

function SettingsEditor({ initial, privileges, busy, onSave }: { initial: FamilySettings; privileges: { id: string; name: string }[]; busy: boolean; onSave: (s: FamilySettings) => void }) {
  const [s, set] = useState(initial), [error, setError] = useState('')
  const update = <K extends keyof FamilySettings>(field: K, value: FamilySettings[K]) => set(prev => ({ ...prev, [field]: value }))
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(''); const windows = [...s.school_windows, ...s.gaming_windows, ...s.bedtime_windows]; if (s.enabled && !s.game_privilege_id) return setError('Select the existing game reward before enabling.'); if (windows.length > 21 || windows.some(w => !w.days.length || !w.start || !w.end || w.start === w.end)) return setError('Each window needs at least one day and different start and end times. Use 21 windows or fewer.'); onSave(s) }
  const num = (label: string, field: 'weekday_minutes' | 'weekend_minutes' | 'bathroom_bonus_minutes', max: number) => <label className="block flex-1 text-[14px]">{label}<input className="field mt-1" type="number" min={0} max={max} required value={s[field]} onChange={e => update(field, Number(e.target.value))} /></label>
  return <form className="panel space-y-5 p-5" onSubmit={submit}><div><h2 className="text-[20px] font-semibold">Game rules</h2><p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Off until you turn them on. Times use Denver time for this pilot.</p></div>
    <label className="block text-[14px]">Existing game reward to replace<select className="field mt-1" value={s.game_privilege_id || ''} onChange={e => update('game_privilege_id', e.target.value || null)}><option value="">Choose a game reward</option>{privileges.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" checked={s.enabled} onChange={e => update('enabled', e.target.checked)} />Enable earned game minutes for this child</label>
    <div className="flex flex-wrap gap-3">{num('Weekday minutes', 'weekday_minutes', 720)}{num('Weekend minutes', 'weekend_minutes', 720)}{num('Bathroom bonus minutes', 'bathroom_bonus_minutes', 240)}</div>
    <label className="flex items-start gap-3 text-[14px]"><input className="mt-1" type="checkbox" checked={s.weekend_requires_chores} onChange={e => update('weekend_requires_chores', e.target.checked)} />Require routine responsibilities on weekends too</label>
    <label className="flex items-start gap-3 text-[14px]"><input className="mt-1" type="checkbox" checked={s.require_parent_approval} onChange={e => update('require_parent_approval', e.target.checked)} />Wait for parent approval of required work before game time</label>
    <WindowEditor title="School time" help="Games pause in these windows. School apps, browsers and YouTube stay available." value={s.school_windows} disabled={busy} onChange={v => update('school_windows', v)} />
    <WindowEditor title="Gaming hours" help="If empty, earned minutes can be used outside school and bedtime windows. Overnight windows are supported." value={s.gaming_windows} disabled={busy} onChange={v => update('gaming_windows', v)} />
    <WindowEditor title="Bedtime for games" help="Games pause in these windows; this does not lock the whole PC." value={s.bedtime_windows} disabled={busy} onChange={v => update('bedtime_windows', v)} />
    {error && <p role="alert" style={{ color: 'var(--miss)' }}>{error}</p>}<button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save game rules'}</button>
  </form>
}

function MoneyPanel({ overview: o, busy, onAction }: { overview: FamilyOverview; busy: boolean; onAction: (body: Record<string, unknown>, onSuccess?: () => void) => void }) {
  const [iou, setIou] = useState('80.00'), [iouDescription, setIouDescription] = useState('Family IOU opening balance')
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [criteria, setCriteria] = useState(''), [price, setPrice] = useState('')
  const [bonusNote, setBonusNote] = useState(''), [payment, setPayment] = useState(''), [pending, setPending] = useState<PendingSettlement | null>(null), [localError, setLocalError] = useState('')
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const saved = readPending(o.childId)
      setPending(saved)
      if (saved) setPayment((saved.amountCents / 100).toFixed(2))
    })
    return () => { active = false }
  }, [o.childId])
  const amount = (v: string, positive = true) => { const c = centsFrom(v); if (!Number.isSafeInteger(c) || c < (positive ? 1 : 0) || c > 1_000_000) { setLocalError('Enter a dollar amount from $0.00 to $10,000.00. Paid jobs and cash payments must be more than zero.'); return null } setLocalError(''); return c }
  const weekend = [0, 6].includes(new Date(`${o.day}T12:00:00Z`).getUTCDay())
  const settle = () => { const c = amount(payment); if (c === null) return; if (pending && c !== pending.amountCents) return setLocalError(`A ${money(pending.amountCents)} payment request is still pending. Retry that amount or check the history and discard the pending request first.`); const retry = !!pending; if (c > o.money.cashOwedCents && !retry) return setLocalError('Payment cannot exceed cash owed.'); if (!confirm(`${retry ? 'Retry recording' : 'Confirm'} ${money(c)} ${retry ? 'using the same payment request' : `already paid to ${o.childName}`}?`)) return; const next = pending || { childId: o.childId, amountCents: c, requestId: crypto.randomUUID() }; if (!savePending(next)) return setLocalError('Could not safely store the payment retry key in this browser. Please enable session storage and try again.'); setPending(next); onAction({ action: 'settle-cash', amountCents: c, requestId: next.requestId }, () => { setPending(null); setPayment('') }) }
  return <section className="space-y-5"><div className="panel space-y-2 p-5"><h2 className="text-[20px] font-semibold">Optional paid work</h2><p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Routine chores are unpaid family responsibilities. Offered jobs are optional. Job earnings first repay the IOU; after that, cash is owed. Money never unlocks games. XP tracks progress only.</p><div className="flex flex-wrap gap-5"><p><strong>{money(o.money.debtRemainingCents)}</strong><span className="block text-[13px]">IOU remaining</span></p><p><strong>{money(o.money.cashOwedCents)}</strong><span className="block text-[13px]">Cash owed</span></p></div>
    {!o.money.initialized && <div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Set an opening IOU</h3><p className="text-[13px]">Suggested $80.00. Enter only an amount your family agrees is already owed; $0.00 is fine if there is no IOU. This does not transfer money.</p><label className="block text-[14px]">Amount in dollars<input className="field mt-1" type="text" inputMode="decimal" value={iou} onChange={e => setIou(e.target.value)} /></label><label className="block text-[14px]">Description<input className="field mt-1" maxLength={200} value={iouDescription} onChange={e => setIouDescription(e.target.value)} /></label><button className="btn btn-quiet" disabled={busy} onClick={() => { const c = amount(iou, false); if (c !== null && iouDescription.trim() && confirm(`Record an opening IOU of ${money(c)}? This can only be set once.`)) onAction({ action: 'open-iou', amountCents: c, description: iouDescription.trim() }) }}>Record opening IOU</button></div>}
  </div>
  <div className="panel space-y-3 p-5"><h3 className="text-[18px] font-semibold">Offer a one-time job</h3>{!o.money.initialized && <p className="text-[13px]">Set the opening IOU first, including $0.00 if nothing is owed.</p>}<label className="block text-[14px]">Job title<input className="field mt-1" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="block text-[14px]">What to do<textarea className="field mt-1" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label><label className="block text-[14px]">What finished looks like<textarea className="field mt-1" maxLength={1000} value={criteria} onChange={e => setCriteria(e.target.value)} /></label><label className="block text-[14px]">Pay in dollars<input className="field mt-1" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label><button className="btn btn-primary" disabled={busy || !o.money.initialized || !title.trim() || !description.trim() || !criteria.trim()} onClick={() => { const c = amount(price); if (c !== null) onAction({ action: 'offer-job', title: title.trim(), description: description.trim(), criteria: criteria.trim(), priceCents: c }) }}>Offer job</button></div>
  <div className="panel space-y-3 p-5"><h3 className="text-[18px] font-semibold">Bathroom deep clean bonus</h3><p className="text-[14px]">Confirm completed work once per weekend. If awarded today, {o.settings.bathroom_bonus_minutes} game minutes last until midnight Denver time.</p>{o.game.bathroomGranted ? <p role="status">Already awarded this weekend.</p> : <><label className="block text-[14px]">What was completed<textarea className="field mt-1" maxLength={500} value={bonusNote} onChange={e => setBonusNote(e.target.value)} /></label><button className="btn btn-quiet" disabled={busy || !weekend || !bonusNote.trim() || !o.settings.enabled} onClick={() => { if (confirm('Confirm the bathroom deep clean was completed?')) onAction({ action: 'bathroom-bonus', note: bonusNote.trim() }) }}>Confirm completed clean</button>{!weekend && <p className="text-[13px]">Available Saturday or Sunday.</p>}{!o.settings.enabled && <p className="text-[13px]">Enable game rules first.</p>}</>}</div>
  <div className="panel space-y-3 p-5"><h3 className="text-[18px] font-semibold">Jobs to review</h3>{!o.jobs.length && <p className="text-[14px]">No jobs yet.</p>}{o.jobs.map(j => <JobReview key={`${j.id}-${j.status}`} job={j} busy={busy} onAction={onAction} />)}</div>
  <div className="panel space-y-2 p-5"><h3 className="text-[18px] font-semibold">Record cash already paid</h3><p className="text-[14px]">This records a real payment you already made. It does not send money.</p><label className="block text-[14px]">Amount in dollars<input className="field mt-1" inputMode="decimal" value={payment} onChange={e => setPayment(e.target.value)} /></label><button className="btn btn-quiet" disabled={busy || (o.money.cashOwedCents <= 0 && !pending)} onClick={settle}>{pending ? 'Retry pending payment' : 'Record payment'}</button>{pending && <div className="space-y-2 rounded-xl border p-3 text-[13px]" role="status"><p>A {money(pending.amountCents)} payment request is pending. Retry uses the same key, even after a reload. Check money history before discarding it.</p><button className="btn btn-quiet" disabled={busy} onClick={() => { if (confirm('Only discard this pending request after checking that it was not recorded. Continue?')) { clearPending(o.childId); setPending(null); setPayment('') } }}>Discard pending request</button></div>}</div>
  {!!o.money.entries.length && <details className="panel p-5"><summary className="cursor-pointer font-semibold">Recent money history (up to 50 entries)</summary><ul className="mt-3 space-y-2">{o.money.entries.map(entry => <li key={entry.id} className="row p-3 text-[13px]"><strong>{entry.description}</strong><span className="block">{clock(entry.created_at)} · IOU {money(entry.debt_delta_cents)} · Cash {money(entry.cash_delta_cents)}</span></li>)}</ul></details>}
  {localError && <p role="alert" style={{ color: 'var(--miss)' }}>{localError}</p>}
  </section>
}

function JobReview({ job: j, busy, onAction }: { job: JobOffer; busy: boolean; onAction: (body: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(j.status === 'submitted')
  const review = (decision: 'approve' | 'changes_requested' | 'cancel') => onAction({ action: 'review-job', jobId: j.id, decision, note: note.trim() })
  return <details className="row p-3" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary className="flex cursor-pointer flex-wrap justify-between gap-2"><strong>{j.title}</strong><span>{money(j.price_cents)} · {j.status.replace('_', ' ')}</span></summary><div className="mt-3 space-y-2"><p className="text-[14px]">{j.description}</p><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Done when: {j.criteria}</p>{j.child_note && <p className="text-[13px]">Child: {j.child_note}</p>}{j.review_note && <p className="text-[13px]">Your note: {j.review_note}</p>}
    {(['submitted', 'offered', 'accepted', 'changes_requested'].includes(j.status)) && <><label className="block text-[13px]">Review note<textarea className="field mt-1" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label><div className="flex flex-wrap gap-2">{j.status === 'submitted' && <><button className="btn btn-primary" disabled={busy} onClick={() => review('approve')}>Approve work</button><button className="btn btn-quiet" disabled={busy || !note.trim()} onClick={() => review('changes_requested')}>Send back with note</button></>}{j.status !== 'submitted' && <button className="btn btn-quiet" disabled={busy} onClick={() => { if (confirm('Cancel this job offer?')) review('cancel') }}>Cancel job</button>}</div></>}
  </div></details>
}

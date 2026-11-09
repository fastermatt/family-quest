'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FamilyOverview, JobOffer } from '@/lib/family-controls/types'
import { duration, money, postJson } from '@/components/family-controls/shared'

export function FamilyControlCard() {
  const qc = useQueryClient()
  const [notice, setNotice] = useState('')
  const q = useQuery<FamilyOverview>({ queryKey: ['my-family-controls'], queryFn: async () => { const r = await fetch('/api/child/family-controls', { cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load family game time.'); return d }, refetchInterval: 15_000 })
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => postJson('/api/child/family-controls', body), onSuccess: () => { setNotice('Sent. Your parent can see the update.'); void qc.invalidateQueries({ queryKey: ['my-family-controls'] }); void qc.invalidateQueries({ queryKey: ['child-today'] }) }, onError: (e: Error) => setNotice(e.message) })
  const o = q.data
  return <section className="panel space-y-4 p-5" aria-label="Game time and optional jobs"><div><h2 className="text-[20px] font-bold">Game time & jobs</h2><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Denver time · games on a connected PC</p></div>
    {q.isPending ? <p role="status">Loading…</p> : q.isError ? <p role="alert">Game time could not load. <button className="btn btn-quiet" onClick={() => void q.refetch()}>Try again</button></p> : o && <>
      {o.settings.enabled ? <><div className="flex flex-wrap gap-6"><div><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Game time left at last PC upload</p><p className="text-[28px] font-bold" style={{ color: 'var(--accent)' }}>{duration(o.game.remainingSeconds)}</p></div><div><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Earned today</p><p className="text-[20px] font-semibold">{duration(o.game.grantedSeconds)}</p></div></div><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>The PC uploads about every five minutes, so the balance may be lower now.</p><p className="text-[14px]">{o.game.reason}</p>{o.game.remainingTasks > 0 && <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{o.game.remainingTasks} required {o.game.remainingTasks === 1 ? 'responsibility' : 'responsibilities'} to finish or correct.</p>}{o.game.bathroomGranted && <p className="text-[13px]">Bathroom bonus already awarded this weekend.</p>}</> : <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Your family has not turned on earned game minutes yet.</p>}
      <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>School and YouTube do not use game minutes. Routine chores are part of family life. Your family&apos;s proof rules determine when work counts toward game time. XP is progress, and money never unlocks games. This pilot works with one linked active PC.</p>
      {o.money.initialized && <div className="row p-3"><h3 className="font-semibold">Optional paid work</h3><p className="mt-1 text-[14px]">{money(o.money.debtRemainingCents)} of the family IOU remaining · {money(o.money.cashOwedCents)} cash owed</p><p className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>Paid jobs first lower the IOU. Your parent records cash after paying you.</p></div>}
      {!!o.jobs.length && <div className="space-y-3"><h3 className="font-semibold">Jobs from your parent</h3>{o.jobs.map(j => <KidJob key={j.id} job={j} busy={save.isPending} onAction={body => { setNotice(''); save.mutate(body) }} />)}</div>}
      {notice && <p role={save.isError ? 'alert' : 'status'} className="text-[13px]">{notice}</p>}
    </>}
  </section>
}
function KidJob({ job: j, busy, onAction }: { job: JobOffer; busy: boolean; onAction: (body: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('')
  return <article className="row space-y-2 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><strong>{j.title}</strong><span className="text-[14px]">{money(j.price_cents)}</span></div><p className="text-[14px]">{j.description}</p><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Finished when: {j.criteria}</p><p className="text-[13px]">{j.status === 'offered' ? 'Optional offer' : j.status === 'accepted' ? 'Accepted' : j.status === 'submitted' ? 'Sent for parent review' : j.status === 'changes_requested' ? 'A few changes needed' : j.status === 'approved' ? 'Approved' : 'Cancelled'}</p>{j.review_note && <p className="text-[13px]">Parent note: {j.review_note}</p>}{j.status === 'offered' && <button className="btn btn-primary" disabled={busy} onClick={() => onAction({ action: 'accept-job', jobId: j.id })}>Accept job</button>}{['accepted', 'changes_requested'].includes(j.status) && <><label className="block text-[13px]">Tell your parent what you completed<textarea className="field mt-1" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label><button className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => onAction({ action: 'submit-job', jobId: j.id, note: note.trim() })}>Send finished work</button></>}</article>
}

'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FamilyIncident, FamilyOverview, JobOffer } from '@/lib/family-controls/types'
import { duration, money, postJson } from '@/components/family-controls/shared'

export function FamilyControlCard() {
  const qc = useQueryClient()
  const [notice, setNotice] = useState('')
  const q = useQuery<FamilyOverview>({ queryKey: ['my-family-controls'], queryFn: async () => { const r = await fetch('/api/child/family-controls', { cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load family game time.'); return d }, refetchInterval: 15_000 })
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => postJson('/api/child/family-controls', body), onSuccess: () => { setNotice('Sent. Your parent can see the update.'); void qc.invalidateQueries({ queryKey: ['my-family-controls'] }); void qc.invalidateQueries({ queryKey: ['child-today'] }) }, onError: (e: Error) => setNotice(e.message) })
  const o = q.data
  return (
    <section aria-label="Game time and jobs">
      {q.isPending ? <p role="status" className="panel p-5">Loading…</p>
        : q.isError ? <p role="alert" className="panel p-5">Game time could not load. <button className="btn btn-quiet ml-2" onClick={() => void q.refetch()}>Try again</button></p>
        : o && <>
          {o.settings.enabled ? <GameTimeCard overview={o} /> : <div className="panel p-5"><p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Your family has not turned on earned game minutes yet.</p></div>}
          {o.money.initialized && <div className="panel mt-4 p-5"><h3 className="font-semibold">Optional paid work</h3><p className="mt-1 text-[14px]">{money(o.money.debtRemainingCents)} of the family IOU remaining · {money(o.money.cashOwedCents)} cash owed</p><p className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>Paid jobs first lower the IOU. Your parent records cash after paying you.</p></div>}
          {!!o.jobs.length && <div className="panel mt-4 space-y-3 p-5"><h3 className="mb-1 font-semibold">Jobs from your parent</h3>{o.jobs.map(j => <KidJob key={j.id} job={j} busy={save.isPending} onAction={body => { setNotice(''); save.mutate(body) }} />)}</div>}
          <p className="mt-4 text-[12px]" style={{ color: 'var(--ink-2)' }}>A linked PC can share supported Edge and Chrome page visits and YouTube links with your parent. These are history records, not proof a video was watched. Parents can also see when PC tracking stops checking in.</p>
          {notice && <p role={save.isError ? 'alert' : 'status'} className="mt-3 text-[13px]">{notice}</p>}
        </>}
    </section>
  )
}

const KIND_LABEL: Record<FamilyIncident['kind'], string> = {
  'disobeyed': 'Disobeyed',
  'lied': 'Lied',
  'talked-back': 'Talked back',
  'other': 'Behaviour issue',
}

function GameTimeCard({ overview: o }: { overview: FamilyOverview }) {
  const g = o.game
  const activeBlock = o.incidents?.find(i => !i.resolved_at && i.consequence === 'block_games')
  const isBlocked = !g.allowed
  const isAlmostUp = g.allowed && g.remainingSeconds > 0 && g.remainingSeconds < 300
  const statusColor = isBlocked ? 'var(--miss)' : isAlmostUp ? '#f59e0b' : 'var(--go)'
  const statusBg = isBlocked ? 'rgba(239,68,68,0.08)' : isAlmostUp ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'
  const statusText = g.paused ? 'Paused' : isBlocked ? (g.grantedSeconds > 0 && g.remainingSeconds === 0 ? 'Time used' : 'Not ready') : isAlmostUp ? 'Almost up' : 'Good to go'

  return (
    <div className="panel overflow-hidden p-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-4" style={{ background: statusBg, borderBottom: '1px solid var(--divider)' }}>
        <h2 className="text-[18px] font-bold">Game time</h2>
        <span className="rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: statusColor, color: '#fff' }}>{statusText}</span>
      </div>

      {/* Big time display */}
      <div className="px-5 pb-2 pt-5">
        <p className="text-[13px] font-medium uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Time left at last PC report</p>
        <p className="mt-1 text-[52px] font-black leading-none tabular-nums" style={{ color: statusColor }}>{duration(g.remainingSeconds)}</p>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>of {duration(g.grantedSeconds)} earned today{g.extraGrantSeconds > 0 ? ` (includes ${duration(g.extraGrantSeconds)} bonus)` : ''}</p>
        <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>Family plan: {o.settings.weekday_minutes} min weekdays · {o.settings.weekend_minutes} min weekends · {o.settings.bathroom_bonus_minutes} min bathroom bonus once per weekend after parent confirmation.</p>
      </div>

      {/* Blocking incident warning */}
      {activeBlock && (
        <div className="mx-5 mb-4 mt-2 rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid var(--miss)' }}>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--miss)' }}>Games are blocked by a parent</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-1)' }}><strong>{KIND_LABEL[activeBlock.kind]}:</strong> {activeBlock.note}</p>
          <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>Talk to your parent. Games unlock when they mark this resolved.</p>
        </div>
      )}

      {/* Status reason (non-block cases) */}
      {!activeBlock && g.reason && (
        <p className="px-5 pb-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>{g.reason}</p>
      )}

      {/* Progress bar */}
      {g.grantedSeconds > 0 && (
        <div className="mx-5 mb-4 mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--divider)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (g.remainingSeconds / g.grantedSeconds) * 100)}%`, background: statusColor }} />
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 border-t px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Tasks left</p>
          <p className="mt-0.5 text-[22px] font-bold">{g.remainingTasks}</p>
        </div>
        {g.bathroomGranted && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Bathroom bonus</p>
            <p className="mt-0.5 text-[14px] font-semibold" style={{ color: 'var(--go)' }}>Awarded this weekend ✓</p>
          </div>
        )}
        <div className="ml-auto self-end">
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Updates ~every 5 min from PC</p>
        </div>
      </div>
    </div>
  )
}

function KidJob({ job: j, busy, onAction }: { job: JobOffer; busy: boolean; onAction: (body: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('')
  return <article className="row space-y-2 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><strong>{j.title}</strong><span className="text-[14px]">{money(j.price_cents)}</span></div><p className="text-[14px]">{j.description}</p><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Finished when: {j.criteria}</p><p className="text-[13px]">{j.status === 'offered' ? 'Optional offer' : j.status === 'accepted' ? 'Accepted' : j.status === 'submitted' ? 'Sent for parent review' : j.status === 'changes_requested' ? 'A few changes needed' : j.status === 'approved' ? 'Approved' : 'Cancelled'}</p>{j.review_note && <p className="text-[13px]">Parent note: {j.review_note}</p>}{j.status === 'offered' && <button className="btn btn-primary" disabled={busy} onClick={() => onAction({ action: 'accept-job', jobId: j.id })}>Accept job</button>}{['accepted', 'changes_requested'].includes(j.status) && <><label className="block text-[13px]">Tell your parent what you completed<textarea className="field mt-1" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label><button className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => onAction({ action: 'submit-job', jobId: j.id, note: note.trim() })}>Send finished work</button></>}</article>
}

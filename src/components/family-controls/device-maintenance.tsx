'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DevicePresence } from './device-presence'

type Kind = 'diagnostics' | 'check-update' | 'test-countdown' | 'apply-update'
type Status = 'queued' | 'running' | 'completed' | 'failed' | 'expired'
type Device = { id: string; name: string; version: string | null; last_seen_at: string | null }
type Command = { id: string; client_id: string; kind: Kind; status: Status; created_at: string; expires_at: string; completed_at: string | null; result: unknown }
type Data = { devices: Device[]; commands: Command[] }
const kinds: { kind: Kind; label: string }[] = [
  { kind: 'diagnostics', label: 'Run diagnostics' },
  { kind: 'check-update', label: 'Check for update' },
  { kind: 'apply-update', label: 'Apply downloaded update' },
  { kind: 'test-countdown', label: 'Test countdown' },
]
const keyFor = (childId: string, clientId: string, kind: Kind) => `pc-command-request:${childId}:${clientId}:${kind}`
function readKey(key: string) { try { const value = sessionStorage.getItem(key); return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null } catch { return null } }
function storeKey(key: string, value: string) { try { sessionStorage.setItem(key, value); return true } catch { return false } }
function clearKey(key: string) { try { sessionStorage.removeItem(key) } catch { /* confirmation already received */ } }
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const version = (value: unknown) => typeof value === 'string' && /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value) ? value : null
const boundedText = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit ? value.trim() : ''
function safeResult(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const r = raw as Record<string, unknown>
  const lines: string[] = []
  const reported = version(r.version)
  if (reported) lines.push(`Reported version: ${reported}`)
  const launcher = version(r.launcherVersion)
  if (launcher) lines.push(`Launcher version: ${launcher}`)
  if (typeof r.remoteActivationAvailable === 'boolean') lines.push(r.remoteActivationAvailable ? 'Launcher supports remote updates' : 'Install the latest Windows package once to enable remote updates')
  if (Number.isSafeInteger(r.policyRevision) && Number(r.policyRevision) >= 0) lines.push(`Policy revision: ${r.policyRevision}`)
  if (Number.isSafeInteger(r.policyAgeSeconds) && Number(r.policyAgeSeconds) >= 0) lines.push(`Policy age: ${r.policyAgeSeconds} seconds`)
  if (typeof r.familyEnabled === 'boolean') lines.push(`Family rules: ${r.familyEnabled ? 'enabled' : 'disabled'}`)
  if (typeof r.gamingAllowed === 'boolean') lines.push(`Game access at check: ${r.gamingAllowed ? 'allowed' : 'paused'}`)
  const outcomes: Record<string, string> = { current: 'No newer signed release found at this check', staged: 'Update downloaded and staged; installed version has not changed', failed: 'Update operation failed', not_checked: 'No update check was completed', deferred: 'Update activation deferred', restart_requested: 'Worker restart requested; wait for the next version check-in' }
  if (typeof r.updateOutcome === 'string' && outcomes[r.updateOutcome]) lines.push(outcomes[r.updateOutcome])
  const updateStatus = boundedText(r.updateStatus, 200)
  if (updateStatus) lines.push(`Update detail: ${updateStatus}`)
  const countdowns: Record<string, string> = { requested: 'Countdown requested; visibility not confirmed', displayed: 'Test countdown displayed', unavailable: 'Test countdown unavailable' }
  if (typeof r.countdownOutcome === 'string' && countdowns[r.countdownOutcome]) lines.push(countdowns[r.countdownOutcome])
  const reason = boundedText(r.reason, 200)
  if (reason) lines.push(`Reason: ${reason}`)
  const errorCode = boundedText(r.errorCode, 80)
  if (errorCode && /^[a-z0-9_]+$/i.test(errorCode)) lines.push(`Code: ${errorCode}`)
  return lines
}

export function DeviceMaintenance({ childId }: { childId: string }) {
  const qc = useQueryClient()
  const [notice, setNotice] = useState('')
  const q = useQuery<Data>({ queryKey: ['pc-maintenance', childId], enabled: !!childId, queryFn: async () => { const r = await fetch(`/api/parent/companion/commands?childId=${encodeURIComponent(childId)}`, { cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load PC maintenance.'); return d }, refetchInterval: query => query.state.data?.commands.some(c => c.status === 'queued' || c.status === 'running') ? 10_000 : 30_000 })
  const run = useMutation({ mutationFn: async ({ clientId, kind, requestId }: { clientId: string; kind: Kind; requestId: string }) => { const r = await fetch('/api/parent/companion/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind, requestId }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'The request was not confirmed. Retry the same action.'); return d }, onSuccess: (_data, variables) => { clearKey(keyFor(childId, variables.clientId, variables.kind)); setNotice('Request accepted. Its status will update below.'); void qc.invalidateQueries({ queryKey: ['pc-maintenance', childId] }) }, onError: (e: Error) => setNotice(e.message) })
  const send = (clientId: string, kind: Kind) => { const key = keyFor(childId, clientId, kind); const requestId = readKey(key) || crypto.randomUUID(); if (!storeKey(key, requestId)) { setNotice('This browser cannot keep a retry key. Enable session storage and try again.'); return } setNotice(''); run.mutate({ clientId, kind, requestId }) }
  return <><section className="panel space-y-3 p-4" aria-label="Remote PC maintenance"><h2 className="text-[20px] font-semibold">PC maintenance</h2><p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Install and link the Windows app once on the child&apos;s PC. After that, these requests run when that app checks in. This pilot supports one active linked PC per child. These buttons run only the listed maintenance actions, not arbitrary commands.</p><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>A 10-second countdown test shows a labelled warning only; it does not stop a game or spend minutes. Update checks may download and stage an update. Applying one waits for games to be idle and may request a worker restart. A completed request does not prove installation; the installed version above changes only after the PC reports it.</p>
    <p><a className="btn btn-quiet" href="/downloads/ChoreZap-Windows-x64.zip" download>Download Windows app</a></p>
    <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Extract the ZIP and run ChoreZap.exe in your child&apos;s Windows account after closing games and using Stop app in the existing ChoreZap dashboard. Existing installations need this package once to update the launcher. Keep server.json beside the EXE. Windows installation and remote-update verification are still part of the supervised pilot.</p>
    {notice && <p role={run.isError ? 'alert' : 'status'} className="text-[14px]">{notice}</p>}
    {q.isPending ? <p role="status">Loading linked PCs…</p> : q.isError ? <p role="alert">{(q.error as Error).message} <button className="btn btn-quiet" onClick={() => void q.refetch()}>Retry</button></p> : !q.data?.devices.length ? <p className="text-[14px]">No linked Windows account yet. Use the link form above after installing the app on the PC.</p> : q.data.devices.map(device => {
      const commands = q.data!.commands.filter(c => c.client_id === device.id).slice(0, 5)
      const active = commands.some(c => c.status === 'queued' || c.status === 'running')
      const offline = !device.last_seen_at || q.dataUpdatedAt - Date.parse(device.last_seen_at) > 2 * 60_000
      return <div className="row space-y-3 p-4" key={device.id}><div><h3 className="font-semibold">{device.name}</h3><p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Installed version: {device.version || 'not reported'} · Last seen: {device.last_seen_at ? date(device.last_seen_at) : 'never'}</p></div>
        <div className="flex flex-wrap gap-2">{kinds.map(k => <button type="button" key={k.kind} className="btn btn-quiet" disabled={run.isPending || active} onClick={() => send(device.id, k.kind)}>{k.label}</button>)}</div>
        {active && offline && <p className="text-[13px]">The PC appears offline. Queued requests wait for its next check-in, or expire after ten minutes.</p>}
        {!!commands.length && <div className="space-y-2"><h4 className="text-[14px] font-semibold">Recent requests</h4>{commands.map(c => <div key={c.id} className="rounded-xl border p-3 text-[13px]"><p><strong>{kinds.find(k => k.kind === c.kind)?.label || 'Maintenance request'}</strong> · {c.status}</p><p style={{ color: 'var(--ink-2)' }}>Requested {date(c.created_at)}{c.completed_at ? ` · Finished ${date(c.completed_at)}` : ` · Expires ${date(c.expires_at)}`}</p>{c.status === 'queued' && <p>Waiting for the PC to check in.</p>}{safeResult(c.result).map((line, i) => <p key={i}>{line}</p>)}</div>)}</div>}
      </div>
    })}
  </section><DevicePresence key={childId} childId={childId} /></>
}

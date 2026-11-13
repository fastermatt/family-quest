'use client'

import { useState } from 'react'
import { pcUsageCoverage } from '@/lib/companion/pc-usage'
import type { FamilyOverview } from '@/lib/family-controls/types'
import { clock, duration } from './shared'

export function GamePhoneControls({ overview, now, busy, onAction }: {
  overview: FamilyOverview
  now: number
  busy: boolean
  onAction: (body: Record<string, unknown>) => void
}) {
  const { day, devices, game, settings } = overview
  const [minutes, setMinutes] = useState(game.todayCapMinutes?.toString() ?? '')
  const pc = devices.length === 1 ? devices[0] : null
  const online = !!pc?.last_seen_at && now - Date.parse(pc.last_seen_at) < 2 * 60_000
  const received = online && settings.revision > 0 && pc?.applied_revision === settings.revision && !!pc.applied_at
  const coverage = pcUsageCoverage(game.lastActivityAt, pc?.last_seen_at, now)
  const budget = game.budgetSeconds ?? (settings.enabled ? game.grantedSeconds : null)
  const status = !pc ? (devices.length ? 'Select one linked PC before relying on these controls.' : 'No PC linked.')
    : !online ? 'PC not checking in. Changes wait for it to reconnect.'
    : received ? `PC received these settings at ${clock(pc.applied_at!)}.` : 'Waiting for the PC to confirm receipt.'

  const changeLimit = (value: number | null) => onAction({ action: 'set-day-cap', minutes: value, day, revision: settings.revision })
  const used = game.usedSeconds
  const capValid = /^\d+$/.test(minutes) && Number(minutes) <= 1440
  return <section className="panel space-y-4 p-5" aria-label="Game time controls">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[20px] font-semibold">Game time today</h2>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onAction({ action: 'set-paused', paused: !game.paused })}>{game.paused ? 'Resume games' : 'Pause games'}</button>
    </div>
    <div className="flex flex-wrap gap-6">
      <p><strong className="block text-2xl">{used || coverage.current ? duration(used) : '—'}</strong><span className="text-sm">Recorded gaming</span></p>
      <p><strong className="block text-2xl">{coverage.current ? (budget === null ? 'Unlimited' : duration(game.remainingSeconds)) : '—'}</strong><span className="text-sm">Time left</span></p>
    </div>
    {coverage.message && pc && <p className="text-sm">{coverage.message}</p>}
    <p role="status" className="text-sm" style={{ color: 'var(--ink-2)' }}>{status}</p>
    <p className="text-sm">{game.paused ? 'Pause requested.' : settings.enabled ? game.reason : 'Chore and schedule rules are off.'} {game.mode === 'close' ? 'Close mode gives supported games a 30-second save warning.' : 'The PC is set to remind only. Enable game closing to enforce limits while ChoreZap runs.'}</p>
    <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onAction({ action: 'set-game-mode', mode: game.mode === 'close' ? 'warn' : 'close' })}>{game.mode === 'close' ? 'Switch to reminders only' : 'Enable game closing'}</button>
    {settings.enabled && <p className="text-sm">{game.remainingTasks} of {game.requiredCount} required chores remaining. {duration(game.grantedSeconds)} earned today.</p>}
    <form className="space-y-2 border-t pt-3" onSubmit={e => { e.preventDefault(); if (capValid) changeLimit(Number(minutes)) }}>
      <label className="block text-sm" htmlFor="today-game-cap">Total limit for today (minutes)</label>
      <div className="flex flex-wrap items-end gap-2">
        <input id="today-game-cap" className="field max-w-40" type="number" min={0} max={1440} step={1} inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} />
        <button className="btn btn-quiet" type="submit" disabled={busy || !capValid}>Set today’s limit</button>
        {game.todayCapMinutes != null && <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => changeLimit(null)}>Remove limit for today</button>}
      </div>
      <p className="text-sm" style={{ color: 'var(--ink-2)' }}>Caps earned or regular minutes, includes time already played, and resets at midnight Denver time. {game.todayCapMinutes == null ? 'No separate limit set for today.' : `Today’s limit is ${game.todayCapMinutes} minutes.`}</p>
    </form>
    <div className="flex flex-wrap gap-4 text-sm"><a href="#game-rules" className="underline">Edit gaming hours and chore rules</a><a href="/pc#game-closing" className="underline">PC time and game closing</a></div>
  </section>
}

'use client'

import { useState } from 'react'

type Visit = {
  id?: string; browser?: 'edge' | 'chrome'; profile?: string; domain: string; category: string
  title?: string; url?: string; visitedAt?: string; durationSeconds?: number | null; seconds?: number
}
type Coverage = { status: 'complete' | 'partial' | 'unavailable'; browsers?: { browser: string; profilesDiscovered: number; profilesRead: number; profilesSkipped: number }[] }
export type BrowseData = Visit[] | { entries: Visit[]; coverage: Coverage | null }
const labelOf: Record<string, string> = { youtube: 'YouTube', gaming: 'Gaming site', social: 'Social media', school: 'School', other: 'Other site' }
const when = (value: string) => new Date(value).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const safeLink = (value: string | undefined) => {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
export function BrowserHistory({ browse, day }: { browse?: BrowseData; day?: string }) {
  const [count, setCount] = useState(50)
  const payload = Array.isArray(browse) ? { entries: browse, coverage: null } : browse ?? { entries: [], coverage: null }
  const visits = payload.entries.filter(e => e.visitedAt && Number.isFinite(Date.parse(e.visitedAt))).sort((a, b) => Date.parse(b.visitedAt!) - Date.parse(a.visitedAt!))
  const legacy = payload.entries.filter(e => !e.visitedAt)
  const coverage = payload.coverage
  return <section className="panel space-y-4 p-5" aria-label="Browser visit history"><div><h2 className="text-[20px] font-semibold">Browser visits{day ? ` · ${day}` : ''}</h2><p className="mt-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>Edge and Chrome visits from this Windows user account. Times are Denver time. A visit is not proof a video was watched, for how long, or that someone was paying attention.</p></div>
    {coverage ? <div className="text-[13px]" role="status"><p>{coverage.status === 'complete' ? 'Collector reported all supported profiles readable.' : coverage.status === 'partial' ? 'Partial browser history: some supported profiles could not be read.' : 'Browser history unavailable from this PC.'}</p>{coverage.browsers?.map((b, i) => <p key={`${b.browser}-${i}`} style={{ color: 'var(--ink-2)' }}>{b.browser === 'edge' ? 'Edge' : b.browser === 'chrome' ? 'Chrome' : 'Browser'}: {b.profilesRead} of {b.profilesDiscovered} profiles read{b.profilesSkipped ? `; ${b.profilesSkipped} skipped` : ''}</p>)}</div> : <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Collection coverage has not been reported by this PC version.</p>}
    {!visits.length && <p className="text-[14px]">No timestamped visits have been uploaded. This does not mean there was no browsing.</p>}
    {!!visits.length && <><ol className="space-y-2">{visits.slice(0, count).map((entry, i) => { const href = safeLink(entry.url); const title = entry.title || entry.domain; return <li className="row p-3" key={entry.id || `${entry.visitedAt}-${entry.domain}-${i}`}><time className="block text-[12px]" style={{ color: 'var(--ink-3)' }} dateTime={entry.visitedAt}>{when(entry.visitedAt!)}</time><div className="mt-1 break-words text-[14px] font-medium">{href ? <a className="underline" href={href} target="_blank" rel="noopener noreferrer">{title}</a> : title}</div><p className="mt-1 break-words text-[12px]" style={{ color: 'var(--ink-2)' }}>{labelOf[entry.category] || 'Other site'} · {entry.domain} · {entry.browser === 'edge' ? 'Edge' : entry.browser === 'chrome' ? 'Chrome' : 'Browser'}{entry.profile ? ` · ${entry.profile}` : ''}{href ? ' · Open visit link' : ''}</p></li> })}</ol>{visits.length > count && <button className="btn btn-quiet" onClick={() => setCount(count + 50)}>Show more visits ({visits.length - count} remaining)</button>}</>}
    {!!legacy.length && <details className="rounded-xl border p-3"><summary className="cursor-pointer text-[14px] font-semibold">Older domain summary ({legacy.length} items, no visit times)</summary><p className="mt-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>Older app versions reported untimed domain aggregates. Their duration estimates are not reliable watch or attention time.</p><ul className="mt-2 space-y-1">{legacy.slice(0, 30).map((entry, i) => <li key={i} className="break-words text-[13px]">{entry.title || entry.domain}</li>)}</ul>{legacy.length > 30 && <p className="text-[12px]">Showing 30 of {legacy.length} summary items.</p>}</details>}
    <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Only supported Edge and Chrome profiles in this account are included. Private tabs and other browsers may be missing. YouTube visit links are history records, not verified playback or watch time.</p>
  </section>
}

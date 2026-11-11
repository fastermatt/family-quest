'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Monitor, Wifi, WifiOff } from 'lucide-react'
import { summarizePCUsage } from '@/lib/companion/pc-usage'

interface App { executable: string; seconds: number }
interface CompanionState {
  apps: App[]
  rules: { executable: string; label: string; category: string }[]
  settings: { gaming_minutes: number | null; paused: boolean; mode: string }
  clients: { id: string; name: string; last_seen_at: string }[]
  lastUpload: string | null
  children: { id: string; name: string }[]
  childId: string
}

function fmt(sec: number) {
  sec = Math.max(0, Math.floor(sec))
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60) return `${Math.floor(sec / 60)}m`
  return `${sec}s`
}

function sinceLabel(iso: string | null, now: number) {
  if (!iso) return 'Never synced'
  const ms = now - new Date(iso).getTime()
  if (ms < 5 * 60_000) return 'Recent upload'
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
}

export function PCUsageCard() {
  const { data, dataUpdatedAt, isLoading } = useQuery<CompanionState>({
    queryKey: ['parent-companion'],
    queryFn: async () => {
      const r = await fetch('/api/parent/companion')
      if (!r.ok) throw new Error()
      return r.json()
    },
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="skeleton h-24 rounded-2xl" />
  if (!data?.clients?.length) return null

  const { gamingSeconds: gamingSec, topGame } = summarizePCUsage(data.apps ?? [], data.rules ?? [])
  const limitMin = data.settings.gaming_minutes
  const limitSec = limitMin !== null ? limitMin * 60 : null
  const pct = limitSec ? Math.min(100, (gamingSec / limitSec) * 100) : null
  const recentUpload = data.lastUpload ? dataUpdatedAt - new Date(data.lastUpload).getTime() < 5 * 60_000 : false
  const childName = data.children?.find(c => c.id === data.childId)?.name ?? 'Grey'

  const barColor =
    pct === null ? 'var(--accent)' :
    pct >= 100   ? 'var(--miss)' :
    pct >= 80    ? 'var(--wait)' :
                   'var(--accent)'

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Monitor size={16} className="shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />
          <span className="text-[15px] font-semibold">{childName}&apos;s PC</span>
          <span className="flex items-center gap-1 text-[13px]" style={{ color: recentUpload ? 'var(--ok)' : 'var(--ink-3)' }}>
            {recentUpload ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
            {sinceLabel(data.lastUpload, dataUpdatedAt)}
          </span>
        </div>
        <Link href="/pc" className="shrink-0 text-[13px]" style={{ color: 'var(--accent)' }}>
          PC details
        </Link>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Gaming today</span>
          <span className="tabular-nums font-semibold" style={{ color: barColor }}>
            {fmt(gamingSec)}
            {limitMin !== null && (
              <span className="font-normal text-[13px]" style={{ color: 'var(--ink-3)' }}> / {limitMin}m</span>
            )}
          </span>
        </div>
        {limitSec !== null && (
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
        )}
        {data.settings.paused && (
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--wait)' }}>Gaming paused by you</p>
        )}
      </div>

      {topGame && (
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
          Most time: <span style={{ color: 'var(--ink-2)' }}>{topGame.label}</span> ({fmt(topGame.seconds)})
        </p>
      )}
    </div>
  )
}

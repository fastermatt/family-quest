'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

type Kind = 'school' | 'allow' | 'deny'
interface Rule { id: string; kind: Kind; domain: string; note: string }
interface Category { id: string; label: string; description: string; group: string; enabled: boolean }
interface Data { rules: Rule[]; categories: Category[]; alwaysAllowed: string[] }
interface Device {
  id: string
  name: string
  last_seen_at: string | null
  inventory: {
    windows?: { edition?: string; displayVersion?: string }
    accounts?: { name: string; type: string; isAdmin: boolean; enabled: boolean }[]
    browsers?: string[]
    avast?: boolean
    status?: { watching: boolean; samples: number; lastSampleAt: string; lastUploadAt: string; lastError: string }
  }
}

const KIND_LABEL: Record<Kind, string> = { school: 'School (always open)', allow: 'Allow', deny: 'Block' }

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'That did not save. Try again.')
  return json
}

export default function FiltersPage() {
  const qc = useQueryClient()
  const [domain, setDomain] = useState('')
  const [kind, setKind] = useState<Kind>('deny')
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, error: loadError } = useQuery<Data>({
    queryKey: ['filters'],
    queryFn: async () => {
      const res = await fetch('/api/parent/filters')
      if (!res.ok) throw new Error('Could not load filters.')
      return res.json()
    },
  })
  const refresh = () => {
    setSaved('Rules saved for later. No PC blocking is active yet.')
    void qc.invalidateQueries({ queryKey: ['usage'] })
    return qc.invalidateQueries({ queryKey: ['filters'] })
  }

  const usage = useQuery<{ days: number; uploads: number; lastUpload: string | null; sites: { site: string; n: number; examples: string[]; status: string }[] }>({
    queryKey: ['usage'],
    queryFn: async () => {
      const res = await fetch('/api/parent/usage?days=7')
      if (!res.ok) throw new Error('Could not load activity.')
      return res.json()
    },
  })
  const quick = useMutation({
    mutationFn: (v: { kind: Kind; domain: string }) => send('/api/parent/filters', 'POST', v),
    onSuccess: () => { setError(null); refresh(); qc.invalidateQueries({ queryKey: ['usage'] }) },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save.'),
  })

  const [code, setCode] = useState('')
  const devices = useQuery<{ devices: Device[] }>({
    queryKey: ['devices'],
    queryFn: async () => {
      const res = await fetch('/api/parent/devices')
      if (!res.ok) throw new Error('Could not load PCs.')
      return res.json()
    },
  })
  const link = useMutation({
    mutationFn: () => send('/api/parent/devices', 'POST', { code }),
    onSuccess: () => { setCode(''); setError(null); qc.invalidateQueries({ queryKey: ['devices'] }) },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not link.'),
  })
  const unlink = useMutation({
    mutationFn: (id: string) => send(`/api/parent/devices/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not unlink.'),
  })

  const add = useMutation({
    mutationFn: () => send('/api/parent/filters', 'POST', { kind, domain }),
    onSuccess: () => { setDomain(''); setError(null); refresh() },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save.'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => send(`/api/parent/filters/${id}`, 'DELETE'),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not remove.'),
  })
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => send('/api/parent/filters/categories', 'PUT', v),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save.'),
  })

  if (isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" aria-label="Loading" />
  if (loadError || !data) {
    return <p role="alert" style={{ color: 'var(--miss)' }}>Could not load filters. Try again in a minute.</p>
  }

  const groups = ['Lists', 'Apps and sites']

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-bold">PC companion</h1>
        <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>
          Rules can be saved here. This build does not block websites or games, even when a PC is installed and linked.
        </p>
      </header>

      <section className="panel p-4" aria-labelledby="coverage-h">
        <h2 id="coverage-h" className="text-[18px] font-semibold">What this build can tell you</h2>
        <dl className="mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
          {[
            ['Game time', 'Not collected yet', 'The Windows foreground pilot is local-only. Launcher activity is not game time.'],
            ['Browsing journal', 'Not collected yet', 'Page timestamps and YouTube titles need the browser collector.'],
            ['Phone blocking', 'Not implemented', 'Linking a PC does not activate limits, chore gates or blocks.'],
          ].map(([label, state, detail]) => (
            <div key={label} className="py-3">
              <div className="flex flex-wrap justify-between gap-2"><dt className="font-semibold">{label}</dt><dd className="text-[14px]" style={{ color: 'var(--redo)' }}>{state}</dd></div>
              <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>{detail}</p>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[14px]" style={{ color: 'var(--ok)' }}>School and YouTube remain available. Diagnostic sightings never use entertainment minutes.</p>
      </section>

      {saved && <p role="status" className="text-[14px]" style={{ color: 'var(--ok)' }}>{saved}</p>}
      {error && <p role="alert" className="text-[14px]" style={{ color: 'var(--miss)' }}>{error}</p>}

      <section className="panel space-y-3 p-4" aria-labelledby="pc-h">
        <h2 id="pc-h" className="text-[16px] font-semibold">Your PCs</h2>
        {devices.isLoading && <p role="status">Loading linked PCs…</p>}
        {devices.isError && <p role="alert">Could not load PCs. <button className="btn btn-quiet" onClick={() => devices.refetch()}>Retry PCs</button></p>}
        {devices.isSuccess && devices.data.devices.length === 0 && <p style={{ color: 'var(--ink-2)' }}>No PCs linked yet. Pairing enables inventory reports, not time tracking or blocking.</p>}
        {(devices.data?.devices ?? []).map((d) => (
          <div key={d.id} className="row flex items-start gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{d.name}</span>
              <span className="block text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {d.inventory.windows?.edition ?? 'Windows'} {d.inventory.windows?.displayVersion ?? ''}
              </span>
              {(d.inventory.accounts ?? []).filter((a) => a.enabled).map((a) => (
                <span key={a.name} className="block text-[13px]" style={{ color: a.isAdmin ? 'var(--redo)' : 'var(--ink-2)' }}>
                  {a.name}: {a.type} account, {a.isAdmin ? 'administrator' : 'standard user'}
                </span>
              ))}
              <span className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>
                {d.last_seen_at ? `Last report ${new Date(d.last_seen_at).toLocaleString('en-US', { timeZone: 'America/Denver', timeZoneName: 'short' })}` : 'Not reported yet'}
                {d.inventory.avast ? ' · Avast found' : ''}
              </span>
              {d.inventory.status && (
                <span className="block text-[13px]" style={{ color: d.inventory.status.lastError ? 'var(--redo)' : 'var(--ink-3)' }}>
                  {d.inventory.status.watching ? 'Watching' : 'Not watching'}
                  {d.inventory.status.lastUploadAt ? ` · last summary ${new Date(d.inventory.status.lastUploadAt).toLocaleString()}` : ''}
                  {d.inventory.status.lastError ? ` · ${d.inventory.status.lastError}` : ''}
                </span>
              )}
            </span>
            <button type="button" className="btn btn-quiet h-11 w-11 p-0" aria-label={`Unlink ${d.name}`} disabled={unlink.isPending} onClick={() => unlink.mutate(d.id)}>
              <Trash2 className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>
        ))}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (code.replace(/\D/g, '').length === 6) link.mutate() }}>
          <div>
            <label htmlFor="paircode" className="mb-1.5 block text-[14px] font-semibold">Add a PC: code shown on the PC</label>
            <input id="paircode" className="field tracking-[0.3em]" inputMode="numeric" autoComplete="off" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={code.replace(/\D/g, '').length !== 6 || link.isPending}>
            {link.isPending ? 'Linking…' : 'Link this PC'}
          </button>
        </form>
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>A linked PC only reports what it is for now. It blocks nothing yet.</p>
      </section>

      <section className="panel space-y-3 p-4" aria-labelledby="add-h">
        <h2 id="add-h" className="text-[16px] font-semibold">Save a website rule</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (domain.trim()) add.mutate() }}
        >
          <div>
            <label htmlFor="dom" className="mb-1.5 block text-[14px] font-semibold">Website</label>
            <input
              id="dom"
              className="field"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          <div role="radiogroup" aria-label="What to do" className="flex flex-wrap gap-2">
            {(['deny', 'allow', 'school'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={kind === k ? 'btn btn-primary' : 'btn btn-quiet'}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={!domain.trim() || add.isPending}>
            {add.isPending ? 'Saving…' : 'Save rule'}
          </button>
        </form>
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
          Enter a hostname, such as lessons.example.com. Rules cover its subdomains, not individual pages. School exceptions always win; other rules use the most specific hostname. Specific page links are rejected rather than silently becoming whole-site rules.
        </p>
      </section>

      {groups.map((g) => (
        <section key={g} className="space-y-2" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="text-[16px] font-semibold">{g === 'Lists' ? 'Block by category' : 'Website service rules'}</h2>
          {data.categories.filter((c) => c.group === g).map((c) => (
            <label key={c.id} className="row flex items-center gap-3 p-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={c.enabled}
                disabled={toggle.isPending}
                onChange={(e) => toggle.mutate({ id: c.id, enabled: e.target.checked })}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{c.label}</span>
                <span className="block text-[13px]" style={{ color: 'var(--ink-2)' }}>{c.description}</span>
              </span>
            </label>
          ))}
        </section>
      ))}
      <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
        Community category lists are not loaded. Fixed website lists can be evaluated in the preview, but do not stop installed apps or offline games.
        YouTube is never blocked by a category.
      </p>

      <section className="space-y-2" aria-labelledby="seen-h">
        <h2 id="seen-h" className="text-[16px] font-semibold">Network diagnostics</h2>
        <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Whole-PC DNS observations, not Grey&apos;s browsing history. These may include other Windows users and background apps. Counts do not measure visits, time played or videos watched.</p>
        {usage.isLoading ? <p role="status">Loading diagnostics…</p> : usage.isError ? (
          <p role="alert">Could not load diagnostics. <button className="btn btn-quiet" onClick={() => usage.refetch()}>Retry diagnostics</button></p>
        ) : (usage.data?.sites.length ?? 0) === 0 ? (
          <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
            No DNS observations uploaded. Keep this optional diagnostic separate from the planned account-specific activity tracker.
          </p>
        ) : (
          <>
            {usage.data!.sites.slice(0, 30).map((s) => (
              <div key={s.site} className="row space-y-2 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{s.site}</span>
                  <span className="text-[13px]" style={{ color: s.status === 'Would block' ? 'var(--miss)' : 'var(--ink-3)' }}>{s.status}</span>
                  <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{s.n} sightings</span>
                </div>
                <div className="flex gap-2">
                  {(['allow', 'deny', 'school'] as Kind[]).map((k) => (
                    <button key={k} type="button" className="btn btn-quiet h-11 flex-1 px-2 text-[14px]" disabled={quick.isPending} onClick={() => quick.mutate({ kind: k, domain: s.site })}>
                      {k === 'deny' ? 'Save block' : k === 'allow' ? 'Save allow' : 'School'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Known infrastructure domains are filtered; other background traffic can remain. “Would block” describes the saved rule, not a confirmed block.
            </p>
          </>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="rules-h">
        <h2 id="rules-h" className="text-[16px] font-semibold">Your rules</h2>
        {data.rules.length === 0 && <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>No rules yet.</p>}
        {data.rules.map((r) => (
          <div key={r.id} className="row flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{r.domain}</span>
              <span className="block text-[13px]" style={{ color: r.kind === 'deny' ? 'var(--miss)' : 'var(--ok)' }}>
                {KIND_LABEL[r.kind]} · saved, not applied
              </span>
            </span>
            <button
              type="button"
              className="btn btn-quiet h-11 w-11 p-0"
              aria-label={`Remove ${r.domain}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(r.id)}
            >
              <Trash2 className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>
        ))}
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
          Always open, not editable: {data.alwaysAllowed.join(', ')}.
        </p>
      </section>
    </div>
  )
}

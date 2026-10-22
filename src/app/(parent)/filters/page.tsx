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
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, error: loadError } = useQuery<Data>({
    queryKey: ['filters'],
    queryFn: async () => {
      const res = await fetch('/api/parent/filters')
      if (!res.ok) throw new Error('Could not load filters.')
      return res.json()
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['filters'] })

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
        <h1 className="text-[22px] font-bold">Web filters</h1>
        <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>
          Preview only. These settings are saved, but nothing is enforced on a PC until the Windows app is installed and paired.
        </p>
      </header>

      {error && <p role="alert" className="text-[14px]" style={{ color: 'var(--miss)' }}>{error}</p>}

      <section className="panel space-y-3 p-4" aria-labelledby="pc-h">
        <h2 id="pc-h" className="text-[16px] font-semibold">Your PCs</h2>
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
                {d.last_seen_at ? `Last seen ${new Date(d.last_seen_at).toLocaleString()}` : 'Not reported yet'}
                {d.inventory.avast ? ' · Avast found' : ''}
              </span>
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
        <h2 id="add-h" className="text-[16px] font-semibold">Add a site</h2>
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
            {add.isPending ? 'Saving…' : 'Add'}
          </button>
        </form>
        <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
          A site also covers its subdomains. The most specific rule wins, so you can block a site but keep one of its pages open.
        </p>
      </section>

      {groups.map((g) => (
        <section key={g} className="space-y-2" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="text-[16px] font-semibold">{g === 'Lists' ? 'Block by category' : 'Block an app or site'}</h2>
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
        Category lists from the community are not loaded yet in this version; apps and sites with a fixed list work in the preview only.
        YouTube is never blocked by a category.
      </p>

      <section className="space-y-2" aria-labelledby="rules-h">
        <h2 id="rules-h" className="text-[16px] font-semibold">Your rules</h2>
        {data.rules.length === 0 && <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>No rules yet.</p>}
        {data.rules.map((r) => (
          <div key={r.id} className="row flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{r.domain}</span>
              <span className="block text-[13px]" style={{ color: r.kind === 'deny' ? 'var(--miss)' : 'var(--ok)' }}>
                {KIND_LABEL[r.kind]}
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

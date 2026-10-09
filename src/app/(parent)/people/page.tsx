'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AlertTriangle, Check, Copy, KeyRound, Link2, Loader2, MessageSquare } from 'lucide-react'

interface Member {
  id: string
  name: string
  role: 'parent' | 'child'
  emoji: string
  hasPin: boolean
}

interface Invite {
  url: string
  name: string
  expiresInHours: number
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'That did not save. Try again.')
  return json
}

function PinForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => post('/api/set-pin', { profileId: member.id, pin }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save.'),
  })
  const mismatch = again.length === 4 && again !== pin

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (pin.length === 4 && pin === again) save.mutate()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`pin-${member.id}`} className="mb-1.5 block text-[14px] font-semibold">
            New PIN
          </label>
          <input
            id={`pin-${member.id}`}
            className="field tracking-[0.3em]"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor={`pin2-${member.id}`} className="mb-1.5 block text-[14px] font-semibold">
            Again
          </label>
          <input
            id={`pin2-${member.id}`}
            className="field tracking-[0.3em]"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4}"
            maxLength={4}
            value={again}
            onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))}
            aria-invalid={mismatch}
          />
        </div>
      </div>
      {(mismatch || error) && (
        <p className="text-[14px]" style={{ color: 'var(--miss)' }} role="alert">
          {mismatch ? 'The two PINs do not match.' : error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={pin.length !== 4 || pin !== again || save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save PIN
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function PeoplePage() {
  const qc = useQueryClient()
  const [settingFor, setSettingFor] = useState<string | null>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteFor, setInviteFor] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['parent-overview'],
    queryFn: async () => {
      const res = await fetch('/api/parent/overview', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not load.')
      return json as { members: Member[]; me: { id?: string } }
    },
  })

  const makeLink = useMutation({
    mutationFn: (profileId: string) => post('/api/parent/invite', { profileId }) as Promise<Invite>,
    onMutate: (id) => {
      setInviteFor(id)
      setInvite(null)
      setCopied(false)
      setError(null)
    },
    onSuccess: (inv) => setInvite(inv),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not make a link.'),
  })

  const copy = async () => {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite.url)
      setCopied(true)
    } catch {
      setError('Could not copy. Press and hold the link to copy it.')
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading family">
        <div className="skeleton h-10 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[68px]" />
        ))}
      </div>
    )
  }

  const parents = data.members.filter((m) => m.role === 'parent')
  const kids = data.members.filter((m) => m.role === 'child')

  const block = (title: string, list: Member[]) => (
    <section aria-label={title}>
      <h2 className="mb-3 text-[19px]">{title}</h2>
      <ul className="space-y-2">
        {list.map((m) => (
          <li key={m.id} className="row p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[22px]" aria-hidden>
                {m.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold">{m.name}</p>
                <p className="flex items-center gap-1 text-[13px]" style={{ color: m.hasPin ? 'var(--ok)' : 'var(--redo)' }}>
                  {m.hasPin ? <Check className="h-3.5 w-3.5" aria-hidden /> : <KeyRound className="h-3.5 w-3.5" aria-hidden />}
                  {m.hasPin ? 'PIN set' : 'No PIN yet'}
                </p>
              </div>
              <button type="button" className="btn btn-quiet" onClick={() => makeLink.mutate(m.id)} disabled={makeLink.isPending && inviteFor === m.id}>
                <Link2 className="h-4 w-4" aria-hidden />
                PIN link
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setSettingFor(settingFor === m.id ? null : m.id)} aria-expanded={settingFor === m.id}>
                Set PIN
              </button>
            </div>

            {settingFor === m.id && (
              <PinForm
                member={m}
                onDone={() => {
                  setSettingFor(null)
                  qc.invalidateQueries({ queryKey: ['parent-overview'] })
                }}
              />
            )}

            {inviteFor === m.id && invite && (
              <div className="mt-3 space-y-2">
                <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
                  Send this to {invite.name}. It opens a screen where they choose their own PIN. Works once, for {invite.expiresInHours} hours.
                </p>
                <p className="field flex items-center break-all py-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                  {invite.url}
                </p>
                <div className="flex gap-2">
                  <a className="btn btn-primary flex-1" href={`sms:&body=${encodeURIComponent(`Set your ChoreZap PIN: ${invite.url}`)}`}>
                    <MessageSquare className="h-4 w-4" aria-hidden />
                    Text it
                  </a>
                  <button type="button" className="btn btn-quiet" onClick={copy}>
                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] leading-tight">Family</h1>
        <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Everyone signs in on the family screen with a 4-digit PIN.
        </p>
      </header>

      {error && (
        <div className="row flex items-start gap-2 p-3 text-[15px]" role="alert" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--miss)' }} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {block('Parents', parents)}
      {block('Kids', kids)}
    </div>
  )
}

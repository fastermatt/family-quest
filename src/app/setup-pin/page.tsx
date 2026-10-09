'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Opened from a one-time link a parent texts. The person picks their own PIN
// and is signed in.
export default function SetupPinPage() {
  const [token, setToken] = useState('')
  const [who, setWho] = useState<{ name: string; emoji: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') ?? ''
    setToken(t)
    fetch(`/api/setup-pin?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'This link does not work.')
        setWho(j)
      })
      .catch((e) => setError(e.message))
  }, [])

  const mismatch = again.length === 4 && again !== pin

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length !== 4 || pin !== again) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/setup-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save.')
      if (j.signedIn === false) {
        setDone(true)
        setSaving(false)
        return
      }
      window.location.href = j.role === 'child' ? '/home' : '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      {!who && !error && (
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-[180px]" />
        </div>
      )}

      {error && !who && (
        <div className="panel p-5" role="alert">
          <h1 className="text-[22px]">Link expired</h1>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {error}
          </p>
        </div>
      )}

      {who && done && (
        <div className="panel p-5" role="status">
          <h1 className="text-[22px]">PIN saved</h1>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            This phone stays signed in as you. {who.name} can now sign in with the new PIN on the family screen.
          </p>
        </div>
      )}

      {who && !done && (
        <form onSubmit={save} className="space-y-5">
          <div>
            <p className="text-[28px]" aria-hidden>
              {who.emoji}
            </p>
            <h1 className="text-[26px] leading-tight">Hi {who.name}, pick your PIN</h1>
            <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
              Four digits. You will use it to sign in on the family screen.
            </p>
          </div>
          <div>
            <label htmlFor="pin" className="mb-1.5 block text-[14px] font-semibold">
              PIN
            </label>
            <input
              id="pin"
              className="field text-center text-[22px] tracking-[0.5em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="again" className="mb-1.5 block text-[14px] font-semibold">
              Type it again
            </label>
            <input
              id="again"
              className="field text-center text-[22px] tracking-[0.5em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={again}
              onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))}
              aria-invalid={mismatch}
            />
          </div>
          {(mismatch || error) && (
            <p className="text-[14px]" style={{ color: 'var(--miss)' }} role="alert">
              {mismatch ? 'Those do not match.' : error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={pin.length !== 4 || pin !== again || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save and sign in
          </button>
        </form>
      )}
    </main>
  )
}

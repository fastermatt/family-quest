'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'

/**
 * Signs this person out and opens the family picker, so a shared phone can go
 * Grey → Dad → Grey. Anyone picked there still needs their own PIN.
 */
export function SwitchPerson() {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    let familyId: string | null = null
    try {
      const res = await fetch('/api/logout', { method: 'POST' })
      familyId = (await res.json().catch(() => ({})))?.familyId ?? null
    } catch {}
    try {
      if (familyId) localStorage.setItem('family_id', familyId)
      else familyId = localStorage.getItem('family_id')
    } catch {}
    // Full navigation so no signed-in client state survives the switch.
    window.location.replace(familyId ? `/family-login?family=${encodeURIComponent(familyId)}` : '/family-login')
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-semibold"
      style={{ color: 'var(--ink-2)' }}
      aria-label="Switch person"
    >
      <Users className="h-4 w-4" aria-hidden />
      {busy ? 'Switching…' : 'Switch'}
    </button>
  )
}

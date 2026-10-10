'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'

type State = 'loading' | 'hidden' | 'ios-hint' | 'prompt' | 'on' | 'denied'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(b64: string) {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isIos() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function detect(): Promise<State> {
  try {
    if (isIos() && !isStandalone()) return 'ios-hint'
    if (!supported()) return 'hidden'
    if (Notification.permission === 'denied') return 'denied'
    if (Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) return 'on'
    }
    return 'prompt'
  } catch {
    return 'hidden'
  }
}

export function NotifyToggle({ who }: { who: 'kid' | 'parent' }) {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!VAPID) return
    let live = true
    detect().then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [])

  const turnOn = useCallback(async () => {
    if (!VAPID) return
    setErr('')
    setBusy(true)
    try {
      // Permission must be requested straight from the tap (iOS rule).
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'prompt')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
        }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) throw new Error('save failed')
      setState('on')
    } catch {
      setErr('That did not work. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [])

  const turnOff = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('prompt')
    } catch {
      setErr('That did not work. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [])

  if (!VAPID || state === 'loading' || state === 'hidden') return null

  if (state === 'ios-hint') {
    return (
      <div className="row p-3 text-sm" style={{ color: 'var(--ink-2)' }}>
        To get reminders on iPhone, add ChoreZap to your Home Screen (Share → Add to Home Screen), then open it from there.
      </div>
    )
  }

  if (state === 'on') {
    return (
      <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-3)' }}>
        <BellRing size={14} aria-hidden /> {who === 'kid' ? 'Reminders on' : 'Alerts on'}
        <button
          type="button"
          onClick={turnOff}
          disabled={busy}
          className="underline"
          style={{ minHeight: 44, padding: '0 8px', color: 'var(--ink-2)' }}
        >
          Turn off
        </button>
      </p>
    )
  }

  const kid = who === 'kid'
  return (
    <div className="panel flex items-center gap-3 p-3">
      <Bell size={22} aria-hidden style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {kid ? 'Get reminders' : 'Get alerts'}
        </div>
        <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
          {kid
            ? "We'll remind you before 4:00 so you don't lose your rewards."
            : 'Know when Grey sends proof, and get a summary at 8:30 PM.'}
        </div>
        {state === 'denied' && (
          <div className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            Notifications are blocked. Turn them on in Settings &gt; Notifications &gt; ChoreZap.
          </div>
        )}
        {err && (
          <div className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }} role="alert">
            {err}
          </div>
        )}
      </div>
      {state !== 'denied' && (
        <button type="button" className="btn btn-primary" onClick={turnOn} disabled={busy}>
          {kid ? 'Turn on reminders' : 'Turn on alerts'}
        </button>
      )}
    </div>
  )
}

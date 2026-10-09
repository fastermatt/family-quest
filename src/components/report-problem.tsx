'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, MessageSquareWarning, X } from 'lucide-react'

// Keep the last few errors this tab saw, so a report says more than "it broke".
const recent: string[] = []
let listening = false
function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('error', (e) => {
    recent.push(`${e.message} @ ${e.filename?.split('/').pop() ?? ''}:${e.lineno ?? ''}`)
    if (recent.length > 5) recent.shift()
  })
  window.addEventListener('unhandledrejection', (e) => {
    recent.push(`unhandled: ${String((e as PromiseRejectionEvent).reason).slice(0, 300)}`)
    if (recent.length > 5) recent.shift()
  })
}

export function ReportProblem({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => listen(), [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setState('sending')
    try {
      const res = await fetch('/api/report-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, page: window.location.pathname, recentErrors: recent }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not send.')
      setState('sent')
      setText('')
    } catch (err) {
      setState('error')
      setMsg(err instanceof Error ? err.message : 'Could not send.')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setState('idle')
        }}
        className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[14px] font-semibold transition-colors duration-150 hover:bg-white/5 ${compact ? '' : 'mx-auto'}`}
        style={{ color: 'var(--ink-3)' }}
      >
        <MessageSquareWarning className="h-4 w-4" aria-hidden />
        Report a problem
      </button>
    )
  }

  return (
    <section className="panel p-4" aria-label="Report a problem">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[17px]">Report a problem</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-11 w-11 items-center justify-center rounded-[10px] hover:bg-white/5"
          aria-label="Close"
          style={{ color: 'var(--ink-3)' }}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {state === 'sent' ? (
        <p className="flex items-center gap-2 text-[15px]" style={{ color: 'var(--ok)' }} role="status">
          <Check className="h-4 w-4" aria-hidden />
          Sent. Thanks, we will look at it.
        </p>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <label htmlFor="problem-text" className="block text-[14px]" style={{ color: 'var(--ink-2)' }}>
            What were you trying to do, and what happened instead?
          </label>
          <textarea
            id="problem-text"
            className="field min-h-[96px] py-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="I tapped Photo on Feed the chickens and nothing happened."
            autoFocus
          />
          {state === 'error' && (
            <p className="text-[14px]" style={{ color: 'var(--miss)' }} role="alert">
              {msg}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={!text.trim() || state === 'sending'}>
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Send report
          </button>
        </form>
      )}
    </section>
  )
}

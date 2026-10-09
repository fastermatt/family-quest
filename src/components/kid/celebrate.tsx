'use client'

import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

const RM_QUERY = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM_QUERY)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(RM_QUERY).matches,
    () => false
  )
}

// Once per day: remember which date the all-done moment already played.
const ALL_DONE_KEY = 'fq-alldone-day'

export function allDoneSeen(date: string): boolean {
  try {
    return localStorage.getItem(ALL_DONE_KEY) === date
  } catch {
    return false
  }
}

export function markAllDone(date: string) {
  try {
    localStorage.setItem(ALL_DONE_KEY, date)
  } catch {
    // ignore
  }
}

const TONES = {
  ok: { bg: 'rgba(52,211,153,0.14)', fg: 'var(--ok)' },
  wait: { bg: 'rgba(125,211,252,0.12)', fg: 'var(--wait)' },
  idle: { bg: 'rgba(148,163,184,0.1)', fg: 'var(--ink-2)' },
  accent: { bg: 'rgba(45,212,191,0.14)', fg: 'var(--accent)' },
  locked: { bg: 'rgba(148,163,184,0.1)', fg: 'var(--ink-3)' },
} as const

/** The left icon tile. When `fresh`, it pops and sends out one ring. */
export function IconTile({ tone, fresh, children }: { tone: keyof typeof TONES; fresh?: boolean; children: ReactNode }) {
  return (
    <span
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${fresh ? 'fq-pop' : ''}`}
      style={{ background: TONES[tone].bg, color: TONES[tone].fg }}
    >
      {children}
      {fresh && <span className="fq-ring" aria-hidden />}
    </span>
  )
}

/** "+100" floating up from the button area. Positioned by the parent row (relative). */
export function FloatChip({ text, tone }: { text: string; tone: 'ok' | 'wait' }) {
  return (
    <span className="fq-chip" aria-hidden style={{ color: tone === 'ok' ? 'var(--ok)' : 'var(--wait)' }}>
      {text}
    </span>
  )
}

const COLORS = ['var(--accent)', 'var(--ok)', 'var(--redo)', 'var(--wait)']
const COUNT = 24

/** One short burst of CSS particles. Deterministic so renders stay pure. */
export function ParticleBurst() {
  return (
    <div className="fq-particles" aria-hidden>
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = ((i * 360) / COUNT + (i % 3) * 7) * (Math.PI / 180)
        const dist = 110 + ((i * 53) % 100)
        const style = {
          '--dx': `${Math.round(Math.cos(angle) * dist)}px`,
          '--dy': `${Math.round(Math.sin(angle) * dist - 50)}px`,
          '--rot': `${(i * 67) % 360}deg`,
          background: COLORS[i % COLORS.length],
          animationDelay: `${(i % 4) * 20}ms`,
          borderRadius: i % 2 ? '999px' : '2px',
        } as React.CSSProperties
        return <span key={i} className="fq-particle" style={style} />
      })}
    </div>
  )
}

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const click = useCallback(() => onToggle(), [onToggle])
  return (
    <button
      type="button"
      className="btn btn-quiet shrink-0"
      style={{ width: 44, padding: 0 }}
      onClick={click}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
    >
      {muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
    </button>
  )
}

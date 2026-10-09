'use client'

import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconTile } from './celebrate'

/** One tappable summary row for an optional card. */
export function CollapsedRow({
  icon,
  title,
  badge,
  done,
  open,
  onToggle,
  controls,
  children,
}: {
  icon: ReactNode
  title: string
  badge?: string
  done: boolean
  open: boolean
  onToggle: () => void
  controls?: string
  children?: ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="row flex min-h-[56px] w-full items-center gap-3 p-3 text-left"
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
        style={done ? { background: 'rgba(52,211,153,0.06)' } : undefined}
      >
        <IconTile tone={done ? 'ok' : 'accent'}>{done ? <Check className="h-5 w-5" aria-hidden /> : icon}</IconTile>
        <span className="min-w-0 flex-1 text-[16px] font-semibold leading-snug">{title}</span>
        {!done && badge && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[13px] font-semibold" style={{ background: 'rgba(45,212,191,0.14)', color: 'var(--accent)' }}>
            {badge}
          </span>
        )}
        {done && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--ok)' }} aria-label="Done" />}
        {open ? <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden /> : <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />}
      </button>
      {children}
    </div>
  )
}

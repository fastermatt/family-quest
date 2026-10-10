'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Check, X } from 'lucide-react'

interface WeekDay {
  date: string
  total: number
  done: number
  missed: number
  pct: number
  look: 'perfect' | 'partial' | 'missed' | 'none'
}

interface Week {
  today: string
  days: WeekDay[]
  perfectDays: number
}

const WEEK_KEY = ['child-week']
const TODAY_KEY = ['child-today']
const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const AMBER = '#e0a82e'

const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()

function describe(d: WeekDay, isToday: boolean) {
  const name = isToday ? 'Today' : NAMES[dow(d.date)]
  if (d.total === 0) return `${name}: no chores`
  if (d.look === 'perfect') return `${name}: all ${d.total} done`
  if (d.look === 'missed') return `${name}: ${d.done} of ${d.total} done, some missed`
  return `${name}: ${d.done} of ${d.total} done${isToday ? ' so far' : ''}`
}

function Dot({ d, isToday }: { d: WeekDay; isToday: boolean }) {
  const base = 'relative flex h-7 w-7 items-center justify-center rounded-full'
  let style: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--line)' }
  let mark: React.ReactNode = null

  if (d.look === 'perfect') {
    style = { background: 'var(--ok)', border: '2px solid var(--ok)' }
    mark = <Check className="h-4 w-4" style={{ color: 'var(--accent-ink)' }} strokeWidth={3} aria-hidden />
  } else if (d.look === 'missed') {
    style = { background: 'transparent', border: '2px solid var(--miss)' }
    mark = <X className="h-3.5 w-3.5" style={{ color: 'var(--miss)' }} strokeWidth={3} aria-hidden />
  } else if (d.look === 'partial') {
    // Filled from the bottom by how much is done: today in teal (still going), earlier days in amber (waiting on a parent).
    const color = isToday ? 'var(--accent)' : AMBER
    style = { background: `linear-gradient(to top, ${color} ${Math.max(d.pct, 15)}%, transparent ${Math.max(d.pct, 15)}%)`, border: `2px solid ${color}` }
  }

  return (
    <span className={base} style={{ ...style, boxShadow: isToday ? '0 0 0 2px var(--surface-1), 0 0 0 4px var(--ink-2)' : undefined }} role="img" aria-label={describe(d, isToday)}>
      {mark}
    </span>
  )
}

/**
 * Last seven days, today last, with a one-line caption. Loads its own data and
 * refreshes whenever the kid's "today" data does, so it follows chores as they are sent in.
 */
export function WeekStrip() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: WEEK_KEY,
    queryFn: async () => {
      const res = await fetch('/api/child/week', { cache: 'no-store' })
      if (!res.ok) throw new Error('week')
      return (await res.json()) as Week
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success' && event.query.queryKey[0] === TODAY_KEY[0]) {
        qc.invalidateQueries({ queryKey: WEEK_KEY })
      }
    })
  }, [qc])

  if (!data) {
    // Quiet while loading, and if it fails: this strip is a nice-to-have, never a blocker.
    return <div className="skeleton h-[68px]" aria-hidden />
  }

  const n = data.perfectDays
  const caption = n === 0 ? 'Make today a perfect day' : `${n} perfect day${n === 1 ? '' : 's'} this week`

  return (
    <section aria-label="Your week" className="px-1">
      <p className="mb-2 text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }} aria-live="polite">
        {caption}
      </p>
      <ul className="flex items-end justify-between">
        {data.days.map((d) => {
          const isToday = d.date === data.today
          return (
            <li key={d.date} className="flex w-9 flex-col items-center gap-1.5">
              <span className="text-[12px] font-semibold" style={{ color: isToday ? 'var(--ink)' : 'var(--ink-3)' }} aria-hidden>
                {INITIALS[dow(d.date)]}
              </span>
              <Dot d={d} isToday={isToday} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

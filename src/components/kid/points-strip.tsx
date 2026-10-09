'use client'

import { useEffect, useRef, useState } from 'react'
import { getLevelInfo } from '@/lib/utils'

const COUNT_MS = 600

/** Level name, thin level bar, points, and what is still waiting for a parent. */
export function PointsStrip({ xp, waiting, reduced }: { xp: number; waiting: number; reduced: boolean }) {
  const [shown, setShown] = useState(xp)
  const [pulse, setPulse] = useState(0)
  const shownRef = useRef(xp)
  const target = useRef(xp)

  useEffect(() => {
    if (xp === target.current) return
    const from = shownRef.current
    const increased = xp > target.current
    target.current = xp
    let raf = 0

    if (reduced || !increased) {
      raf = requestAnimationFrame(() => {
        shownRef.current = xp
        setShown(xp)
      })
      return () => cancelAnimationFrame(raf)
    }

    let start = 0
    const tick = (now: number) => {
      if (!start) {
        start = now
        setPulse((p) => p + 1)
      }
      const t = Math.min(1, (now - start) / COUNT_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (xp - from) * eased)
      shownRef.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [xp, reduced])

  const { currentLevel, nextLevel, progress } = getLevelInfo(shown)
  const maxed = currentLevel.level === nextLevel.level

  return (
    <section className="panel px-4 py-3" aria-label="Level and points">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold">
          Level {currentLevel.level} <span style={{ color: 'var(--ink-2)' }}>· {currentLevel.name}</span>
        </p>
        <p className="text-[15px] font-semibold">
          <span key={pulse} className={`inline-block tabular-nums ${pulse > 0 ? 'fq-pulse' : ''}`}>
            {shown.toLocaleString('en-US')}
          </span>{' '}
          <span style={{ color: 'var(--ink-2)' }}>pts</span>
        </p>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full"
        style={{ background: 'rgba(148,163,184,0.18)' }}
        role="progressbar"
        aria-label={maxed ? 'Top level reached' : `Progress to ${nextLevel.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="fq-bar h-full origin-left rounded-full" style={{ background: 'var(--accent)', transform: `scaleX(${progress / 100})` }} />
      </div>
      {waiting > 0 && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--wait)' }}>
          +{waiting} waiting for a check
        </p>
      )}
    </section>
  )
}

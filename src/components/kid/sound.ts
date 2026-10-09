'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Tiny Web Audio chime plus the persisted mute switch. No audio files.

const MUTE_KEY = 'fq-muted'
const listeners = new Set<() => void>()
let ctx: AudioContext | null = null

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useMuted(): [boolean, () => void] {
  const muted = useSyncExternalStore(subscribe, readMuted, () => false)
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(MUTE_KEY, readMuted() ? '0' : '1')
    } catch {
      // storage blocked: the toggle just won't persist
    }
    listeners.forEach((l) => l())
  }, [])
  return [muted, toggle]
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Call from a tap handler so the browser lets later sounds play. */
export function primeAudio() {
  getCtx()
}

/**
 * 'done': two quick notes (rising major third), about 250ms.
 * 'all': three notes (C, E, G), a little longer and a touch louder.
 * delay is in seconds, so a second chime can queue behind the first.
 */
export function playChime(kind: 'done' | 'all', delay = 0) {
  if (readMuted()) return
  const c = getCtx()
  if (!c) return
  try {
    const notes = kind === 'done' ? [523.25, 659.25] : [523.25, 659.25, 783.99]
    const step = kind === 'done' ? 0.09 : 0.11
    const peak = kind === 'done' ? 0.05 : 0.07
    const t0 = c.currentTime + delay
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1
      const start = t0 + i * step
      const dur = last ? (kind === 'done' ? 0.16 : 0.4) : 0.13
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(peak, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(c.destination)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    })
  } catch {
    // sound is a bonus, never an error
  }
}

export function haptic() {
  try {
    navigator.vibrate?.(25)
  } catch {
    // unsupported
  }
}

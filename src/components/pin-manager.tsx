'use client'

import { useState } from 'react'
import { GlassCard } from '@/components/ui/glass-card'

interface Profile {
  id: string
  name: string
  avatar_emoji: string
  role: string
  has_pin: boolean
}

export function PinManager({ members }: { members: Profile[] }) {
  const [settingPin, setSettingPin] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startSet = (profileId: string) => {
    setSettingPin(profileId)
    setPin('')
    setConfirm('')
    setStep('enter')
    setError(null)
    setSuccess(null)
  }

  const handleDigit = (d: string) => {
    if (step === 'enter') {
      const next = pin + d
      setPin(next)
      if (next.length === 4) setStep('confirm')
    } else {
      const next = confirm + d
      setConfirm(next)
      if (next.length === 4) {
        if (next !== pin) {
          setError("PINs don't match — try again")
          setPin('')
          setConfirm('')
          setStep('enter')
        } else {
          savePin(next)
        }
      }
    }
  }

  const handleDelete = () => {
    if (step === 'enter') setPin(p => p.slice(0, -1))
    else setConfirm(p => p.slice(0, -1))
    setError(null)
  }

  const savePin = async (finalPin: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: settingPin, pin: finalPin }),
      })
      if (res.ok) {
        setSuccess('PIN set!')
        setTimeout(() => {
          setSettingPin(null)
          setSuccess(null)
        }, 1500)
      } else {
        setError('Failed to save PIN')
      }
    } catch {
      setError('Failed to save PIN')
    } finally {
      setSaving(false)
    }
  }

  const currentDots = step === 'enter' ? pin : confirm
  const currentLabel = step === 'enter' ? 'Enter a 4-digit PIN' : 'Enter it again to confirm'

  return (
    <div className="space-y-3">
      {members.map(m => (
        <GlassCard key={m.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{m.avatar_emoji || (m.role === 'parent' ? '👤' : '🧒')}</span>
              <div>
                <p className="font-semibold">{m.name}</p>
                <p className="text-xs text-white/40">{m.has_pin ? '✓ PIN set' : 'No PIN yet'}</p>
              </div>
            </div>
            <button
              onClick={() => startSet(m.id)}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-teal-400/40 text-teal-300 hover:bg-teal-400/10 transition-all"
            >
              {m.has_pin ? 'Change PIN' : 'Set PIN'}
            </button>
          </div>

          {/* Inline PIN entry for this member */}
          {settingPin === m.id && (
            <div className="mt-5 pt-5 border-t border-white/10 space-y-4">
              {success ? (
                <p className="text-center text-green-400 font-semibold py-2">✓ {success}</p>
              ) : (
                <>
                  <p className="text-center text-sm text-white/60">{currentLabel}</p>

                  {/* Dots */}
                  <div className="flex justify-center gap-4">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                        i < currentDots.length ? 'bg-teal-400 border-teal-400' : 'border-white/30'
                      }`} />
                    ))}
                  </div>

                  {error && <p className="text-center text-red-400 text-sm">{error}</p>}

                  {/* Numpad */}
                  <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                    {['1','2','3','4','5','6','7','8','9'].map(d => (
                      <button
                        key={d}
                        onClick={() => handleDigit(d)}
                        disabled={saving || currentDots.length >= 4}
                        className="glass-card py-4 text-xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
                      >
                        {d}
                      </button>
                    ))}
                    <div />
                    <button
                      onClick={() => handleDigit('0')}
                      disabled={saving || currentDots.length >= 4}
                      className="glass-card py-4 text-xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
                    >
                      0
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={saving || currentDots.length === 0}
                      className="glass-card py-4 text-lg hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
                    >
                      ⌫
                    </button>
                  </div>

                  <button
                    onClick={() => setSettingPin(null)}
                    className="w-full text-center text-sm text-white/30 hover:text-white/60 transition-colors pt-1"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  )
}

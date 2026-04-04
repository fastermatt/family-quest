'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface FamilyMember {
  id: string
  name: string
  role: string
  avatar_emoji: string
  has_pin: boolean
}

type Screen = 'pick' | 'pin' | 'error'

export default function FamilyLoginPage() {
  const router = useRouter()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<Screen>('pick')
  const [selected, setSelected] = useState<FamilyMember | null>(null)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    fetch('/api/family-members')
      .then(r => r.json())
      .then(data => { setMembers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSelect = (member: FamilyMember) => {
    setSelected(member)
    setPin('')
    setErrorMsg('')
    setScreen('pin')
  }

  const handleDigit = async (digit: string) => {
    if (submitting) return
    const next = pin + digit
    setPin(next)

    if (next.length === 4) {
      setSubmitting(true)
      try {
        const res = await fetch('/api/pin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: selected!.id, pin: next }),
        })
        if (res.ok) {
          const { role } = await res.json()
          router.replace(role === 'child' ? '/home' : '/dashboard')
        } else {
          // Wrong PIN — shake and reset
          setShake(true)
          setTimeout(() => { setShake(false); setPin(''); setSubmitting(false) }, 600)
          setErrorMsg('Wrong PIN — try again')
        }
      } catch {
        setShake(true)
        setTimeout(() => { setShake(false); setPin(''); setSubmitting(false) }, 600)
        setErrorMsg('Something went wrong')
      }
    }
  }

  const handleDelete = () => {
    if (submitting) return
    setPin(p => p.slice(0, -1))
    setErrorMsg('')
  }

  const children = members.filter(m => m.role === 'child')
  const parents = members.filter(m => m.role === 'parent')

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image src="/logo.svg" alt="Home Base" width={160} height={42} className="mx-auto mb-3" priority />
          <p className="text-white/50 text-sm">Who are you?</p>
        </div>

        {/* Pick member screen */}
        {screen === 'pick' && (
          <div className="space-y-6">
            {loading ? (
              <div className="text-center text-white/40 py-12">Loading...</div>
            ) : (
              <>
                {/* Kids */}
                {children.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Kids</p>
                    <div className="grid grid-cols-2 gap-3">
                      {children.map(m => (
                        <button
                          key={m.id}
                          onClick={() => handleSelect(m)}
                          className="glass-card p-5 flex flex-col items-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
                        >
                          <span className="text-5xl">{m.avatar_emoji || '🧒'}</span>
                          <span className="font-bold text-lg">{m.name}</span>
                          {!m.has_pin && (
                            <span className="text-xs text-orange-400/80">No PIN set</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parents */}
                {parents.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Parents</p>
                    <div className="grid grid-cols-2 gap-3">
                      {parents.map(m => (
                        <button
                          key={m.id}
                          onClick={() => handleSelect(m)}
                          className="glass-card p-5 flex flex-col items-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
                        >
                          <span className="text-5xl">{m.avatar_emoji || '👤'}</span>
                          <span className="font-bold text-lg">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* PIN entry screen */}
        {screen === 'pin' && selected && (
          <div className="space-y-6">
            {/* Back + who */}
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => { setScreen('pick'); setPin(''); setErrorMsg('') }}
                className="text-white/40 hover:text-white transition-colors text-sm"
              >
                ← Back
              </button>
            </div>

            <div className="text-center">
              <div className="text-6xl mb-2">{selected.avatar_emoji || '🧒'}</div>
              <h2 className="text-2xl font-bold">{selected.name}</h2>
              <p className="text-white/50 text-sm mt-1">Enter your PIN</p>
            </div>

            {/* PIN dots */}
            <div className={`flex justify-center gap-5 py-2 ${shake ? 'animate-shake' : ''}`}>
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                    i < pin.length
                      ? 'bg-teal-400 border-teal-400 scale-110'
                      : 'border-white/30'
                  }`}
                />
              ))}
            </div>

            {errorMsg && (
              <p className="text-center text-red-400 text-sm">{errorMsg}</p>
            )}

            {/* Number pad */}
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  disabled={submitting || pin.length >= 4}
                  className="glass-card py-5 text-2xl font-bold hover:bg-white/10 active:scale-95 active:bg-white/20 transition-all disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
              {/* Bottom row: empty, 0, delete */}
              <div />
              <button
                onClick={() => handleDigit('0')}
                disabled={submitting || pin.length >= 4}
                className="glass-card py-5 text-2xl font-bold hover:bg-white/10 active:scale-95 active:bg-white/20 transition-all disabled:opacity-40"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting || pin.length === 0}
                className="glass-card py-5 text-xl hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
              >
                ⌫
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  )
}

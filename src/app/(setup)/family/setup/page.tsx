'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'

interface Child {
  name: string
  avatar: string
}

export default function FamilySetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'family' | 'children'>(
    'family'
  )
  const [familyName, setFamilyName] = useState('')
  const [parentName, setParentName] = useState('')
  const [children, setChildren] = useState<Child[]>([{ name: '', avatar: 'ð¦' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addChild = () => {
    setChildren([...children, { name: '', avatar: AVATAR_EMOJIS[0] }])
  }

  const removeChild = (index: number) => {
    setChildren(children.filter((_, i) => i !== index))
  }

  const updateChild = (
    index: number,
    field: 'name' | 'avatar',
    value: string
  ) => {
    const updated = [...children]
    updated[index][field] = value
    setChildren(updated)
  }

  const handleSetupFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyName.trim()) {
      setError('Family name is required')
      return
    }
    setStep('children')
    setError(null)
  }

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault()
    if (children.some((c) => !c.name.trim())) {
      setError('All children must have names')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use the server-side API route which has service role access to bypass RLS
      const res = await fetch('/api/setup-family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyName, parentName, children }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create family')
      }

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {step === 'family' ? (
          <GlassCard className="p-8">
            <div className="flex justify-center mb-4"><img src="/logo.svg" alt="Home Base" className="w-32" /></div>
            <h1 className="text-3xl font-bold mb-2">Welcome to Home Base</h1>
            <p className="text-white/60 mb-8">
              Let&apos;s set up your family&apos;s command center
            </p>

            <form onSubmit={handleSetupFamily} className="space-y-6">
              <div>
                <label htmlFor="family-name" className="block text-sm font-medium mb-2">
                  Family Name
                </label>
                <input
                  id="family-name"
                  type="text"
                  required
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="The Smiths"
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="parent-name" className="block text-sm font-medium mb-2">
                  Your Name (Parent)
                </label>
                <input
                  id="parent-name"
                  type="text"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="Mom / Dad / Your name"
                  className="w-full"
                />
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/20 border border-red-400/50 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </GlassCard>
        ) : (
          <GlassCard className="p-8">
            <h2 className="text-2xl font-bold mb-2">Add Your Children</h2>
            <p className="text-white/60 mb-8">
              {familyName}&apos;s family members
            </p>

            <form onSubmit={handleCreateFamily} className="space-y-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {children.map((child, index) => (
                  <div
                    key={index}
                    className="glass-card p-4 space-y-3"
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Child {index + 1} Name
                      </label>
                      <input
                        type="text"
                        required
                        value={child.name}
                        onChange={(e) =>
                          updateChild(index, 'name', e.target.value)
                        }
                        placeholder="Child name"
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Avatar
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        {AVATAR_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              updateChild(index, 'avatar', emoji)
                            }
                            className={`text-2xl p-2 rounded-lg transition-all ${
                              child.avatar === emoji
                                ? 'bg-teal-600/30 border-2 border-teal-400'
                                : 'bg-white/5 border border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChild(index)}
                        className="text-sm text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={addChild}
              >
                + Add Another Child
              </Button>

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/20 border border-red-400/50 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setStep('family')
                    setError(null)
                  }}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Creating...' : 'Create Family'}
                </Button>
              </div>
            </form>
          </GlassCard>
        )}
      </div>
    </div>
  )
}

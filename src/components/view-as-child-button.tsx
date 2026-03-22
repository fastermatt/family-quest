'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ViewAsChildButton({ childId }: { childId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    await fetch('/api/switch-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: childId }),
    })
    router.push('/home')
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 border border-teal-400/40 font-medium px-3 py-1.5 rounded-full transition-all disabled:opacity-50"
    >
      {loading ? '...' : '👁 View as Child'}
    </button>
  )
}

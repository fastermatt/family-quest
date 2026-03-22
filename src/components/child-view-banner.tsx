'use client'

import { useRouter } from 'next/navigation'

export function ChildViewBanner({ childName, childEmoji }: { childName: string; childEmoji: string }) {
  const router = useRouter()

  const handleBack = async () => {
    await fetch('/api/switch-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: null }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500/90 backdrop-blur-sm border-b border-orange-400/50 px-4 py-2 flex items-center justify-between">
      <span className="text-sm font-semibold text-white">
        {childEmoji} Viewing as {childName}
      </span>
      <button
        onClick={handleBack}
        className="text-xs bg-white/20 hover:bg-white/30 text-white font-medium px-3 py-1 rounded-full transition-all"
      >
        ← Parent View
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// This page handles three scenarios:
// 1. Fresh magic link click in Safari (not standalone): show bridge page to open in PWA
// 2. Fresh magic link click inside PWA (standalone): set cookie + localStorage, redirect to /home
// 3. PWA cold launch with no token in URL: read token from localStorage, set cookie, redirect to /home
function ChildLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [bridgeMode, setBridgeMode] = useState(false)
  const [bridgeToken, setBridgeToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token')
    const tokenFromStorage = localStorage.getItem('child_profile_token')
    const token = tokenFromUrl || tokenFromStorage

    if (!token) {
      router.replace('/login')
      return
    }

    // Detect if we're running as an installed PWA (standalone) or in Safari
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    // If we're in Safari (not standalone) and have a fresh token from URL,
    // show a bridge page so the user can open the link inside the PWA.
    // This is needed because Safari and standalone PWAs have separate cookie/storage jars on iOS.
    if (tokenFromUrl && !isStandalone) {
      // Still set the cookie + localStorage in Safari context (for "Continue in Safari" fallback)
      localStorage.setItem('child_profile_token', tokenFromUrl)
      fetch('/api/set-child-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenFromUrl }),
      })

      setBridgeToken(tokenFromUrl)
      setBridgeMode(true)
      return
    }

    // We're inside the PWA (standalone) or continuing in Safari — process the token normally
    if (tokenFromUrl) {
      localStorage.setItem('child_profile_token', tokenFromUrl)
    }

    fetch('/api/set-child-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (res.ok) {
          router.replace('/home')
        } else {
          localStorage.removeItem('child_profile_token')
          setError('This link may have expired. Ask your parent for a new one.')
        }
      })
      .catch(() => {
        setError('Something went wrong. Please try again.')
      })
  }, [router, searchParams])

  // Bridge page: shown in Safari when a magic link is clicked
  if (bridgeMode && bridgeToken) {
    const appUrl = `${window.location.origin}/child-login?token=${bridgeToken}`

    const handleContinueInBrowser = () => {
      setBridgeMode(false)
      // Re-trigger the normal flow — cookie is already set above
      router.replace('/home')
    }

    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-sm">
          <div className="text-6xl">{'\u26A1'}</div>
          <h1 className="text-2xl font-bold text-white">You're logged in!</h1>

          <div className="space-y-4">
            <p className="text-white/70">
              If you've added ChoreZap to your Home Screen, tap below to open it:
            </p>

            <a
              href={appUrl}
              className="block w-full py-4 px-6 rounded-2xl bg-teal-500 text-white font-bold text-lg text-center transition-all hover:bg-teal-400 active:scale-95"
            >
              Open in ChoreZap
            </a>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[#020617] px-3 text-white/40">or</span>
              </div>
            </div>

            <button
              onClick={handleContinueInBrowser}
              className="w-full py-3 px-6 rounded-2xl bg-white/10 text-white/80 font-medium text-center transition-all hover:bg-white/20"
            >
              Continue in Safari
            </button>
          </div>

          <div className="pt-4 border-t border-white/10">
            <p className="text-white/40 text-sm">
              Haven't added ChoreZap yet? Tap the Share button then "Add to Home Screen"
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">{'\uD83D\uDE15'}</div>
          <p className="text-white/80 text-lg">{error}</p>
          <button
            onClick={() => router.replace('/login')}
            className="px-6 py-3 rounded-xl bg-white/10 text-white/80 font-medium"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-5xl animate-bounce">{'\u26A1'}</div>
        <p className="text-white/60 text-lg">Loading your profile...</p>
      </div>
    </div>
  )
}

export default function ChildLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-5xl animate-bounce">{'\u26A1'}</div>
      </div>
    }>
      <ChildLoginInner />
    </Suspense>
  )
}

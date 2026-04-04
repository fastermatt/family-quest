'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// This page handles two scenarios:
// 1. Fresh magic link click: ?token=XXX — sets cookie + localStorage, redirects to /home
// 2. PWA cold launch with no cookie: reads token from localStorage, sets cookie, redirects to /home
function ChildLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token')
    const tokenFromStorage = localStorage.getItem('child_profile_token')
    const token = tokenFromUrl || tokenFromStorage

    if (!token) {
      router.replace('/login')
      return
    }

    // Persist to localStorage so PWA relaunches work
    if (tokenFromUrl) {
      localStorage.setItem('child_profile_token', tokenFromUrl)
    }

    // Set the cookie via API then redirect
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
          router.replace('/login')
        }
      })
      .catch(() => {
        router.replace('/login')
      })
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-5xl animate-bounce">🏠</div>
        <p className="text-white/60 text-lg">Loading your profile...</p>
      </div>
    </div>
  )
}

export default function ChildLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-5xl animate-bounce">🏠</div>
      </div>
    }>
      <ChildLoginInner />
    </Suspense>
  )
}

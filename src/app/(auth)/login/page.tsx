'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const origin = window.location.origin

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      })

      if (signInError) {
        setError(signInError.message)
      } else {
        setSubmitted(true)
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {!submitted ? (
          <div className="glass-card p-8 md:p-12">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-bold mb-2 gradient-text">
                FamilyQuest
              </h1>
              <p className="text-white/60 text-lg font-manrope">
                Your family&apos;s quest hub
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/20 border border-red-400/50 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl font-semibold text-white transition-all gradient-primary hover:shadow-lg hover:shadow-teal-500/30 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>

            <p className="text-center text-sm text-white/50 mt-6">
              We&apos;ll send you a secure link to log in
            </p>
          </div>
        ) : (
          <div className="glass-card p-8 md:p-12 text-center">
            <div className="text-5xl mb-4">📧</div>
            <h2 className="text-2xl font-bold mb-2">Check Your Email</h2>
            <p className="text-white/60 mb-6">
              We&apos;ve sent a login link to <span className="text-teal-400 font-semibold">{email}</span>
            </p>
            <p className="text-white/40 text-sm mb-6">
              Click the link in your email to log in. If you don&apos;t see it, check your spam folder.
            </p>
            <button
              onClick={() => setSubmitted(false)}
              className="w-full py-2 px-4 rounded-2xl font-medium text-teal-400 border border-teal-400/50 hover:bg-teal-400/10 transition-all"
            >
              Try Another Email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

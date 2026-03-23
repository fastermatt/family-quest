'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function ParentNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/privileges', label: 'Privileges' },
    { href: '/bonus', label: 'Bonus' },
    { href: '/review', label: 'Review' },
  ]

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <nav className="glass-card m-4 p-4 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <img src="/logo.svg" alt="Home Base" className="h-10 w-10" />
        <span className="text-xl font-bold gradient-text hidden sm:inline">Home Base</span>
      </Link>

      {/* Desktop Nav */}
      <div className="hidden md:flex items-center gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              pathname === link.href
                ? 'bg-teal-600/30 text-teal-300'
                : 'text-white/70 hover:text-white'
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Sign Out Button */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 border border-red-400/50 text-red-300 hover:bg-red-500/30 transition-all disabled:opacity-50"
      >
        {signingOut ? 'Signing out...' : 'Sign Out'}
      </button>

      {/* Mobile Menu Toggle */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-all"
      >
        ☰
      </button>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="absolute top-20 left-0 right-0 glass-card m-4 p-4 space-y-2 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'block px-4 py-2 rounded-lg text-sm font-medium transition-all',
                pathname === link.href
                  ? 'bg-teal-600/30 text-teal-300'
                  : 'text-white/70 hover:text-white'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}

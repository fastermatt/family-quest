'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function ParentNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/privileges', label: 'Privileges' },
    { href: '/bonus', label: 'Bonus' },
    { href: '/review', label: 'Review' },
    { href: '/links', label: '🔗 Links' },
  ]

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleSignOut = async () => {
    setSigningOut(true)
    setMenuOpen(false)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      await fetch('/api/switch-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: null, clearAll: true }),
      })
      router.push('/login')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div ref={menuRef} className="relative m-4">
      {/* Nav bar */}
      <nav className="glass-card px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-bold gradient-text">
          FamilyQuest
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                pathname === link.href
                  ? 'bg-teal-600/30 text-teal-300'
                  : 'text-white/70 hover:text-white'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop sign out */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="hidden md:block px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 border border-red-400/50 text-red-300 hover:bg-red-500/30 transition-all disabled:opacity-50"
        >
          {signingOut ? '...' : 'Sign Out'}
        </button>

        {/* Mobile hamburger — only visible on mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-all text-white text-lg leading-none"
          aria-label="Menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile dropdown — anchored directly below the nav bar */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 mt-2 glass-card p-3 space-y-1 z-50 shadow-2xl shadow-black/50">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all',
                pathname === link.href
                  ? 'bg-teal-600/30 text-teal-300'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-1 border-t border-white/10">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/10 transition-all disabled:opacity-50"
            >
              {signingOut ? 'Signing out...' : '← Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

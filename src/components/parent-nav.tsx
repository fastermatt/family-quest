'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ClipboardCheck, ListChecks, LogOut, Users } from 'lucide-react'

const LINKS = [
  { href: '/dashboard', label: 'Today', Icon: ClipboardCheck, match: ['/dashboard', '/review'] },
  { href: '/tasks', label: 'Chores', Icon: ListChecks, match: ['/tasks'] },
  { href: '/people', label: 'Family', Icon: Users, match: ['/people'] },
]

export function ParentNav() {
  const pathname = usePathname()
  const [leaving, setLeaving] = useState(false)

  const signOut = async () => {
    setLeaving(true)
    await fetch('/api/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/family-login'
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: 'rgba(2,6,23,0.92)', borderColor: 'var(--line)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <nav className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-2" aria-label="Main">
        {LINKS.map(({ href, label, Icon, match }) => {
          const active = match.includes(pathname)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold transition-colors duration-150 sm:flex-none sm:px-4"
              style={{ color: active ? 'var(--accent)' : 'var(--ink-2)', background: active ? 'rgba(45,212,191,0.12)' : 'transparent' }}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={signOut}
          disabled={leaving}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-[10px] transition-colors duration-150 hover:bg-white/5"
          style={{ color: 'var(--ink-3)' }}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </nav>
    </header>
  )
}

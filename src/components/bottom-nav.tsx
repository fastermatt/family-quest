'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { href: '/home', label: 'Home', icon: '🏠' },
    { href: '/quests', label: 'Quests', icon: '⚔️' },
    { href: '/rewards', label: 'Rewards', icon: '⭐' },
    { href: '/standings', label: 'Standings', icon: '🏆' },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#020617]/95 backdrop-blur-xl">
      <nav className="flex items-center justify-around max-w-md mx-auto h-20 px-4 sm:px-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-2xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-teal-600/30 text-teal-300'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

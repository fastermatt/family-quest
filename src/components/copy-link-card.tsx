'use client'

import { useState } from 'react'
import { GlassCard } from '@/components/ui/glass-card'

interface CopyLinkCardProps {
  name: string
  emoji: string
  role: string
  link: string
}

export function CopyLinkCard({ name, emoji, role, link }: CopyLinkCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `FamilyQuest — ${name}'s link`,
        text: `Tap this link to open FamilyQuest as ${name}`,
        url: link,
      })
    } else {
      handleCopy()
    }
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-4">
        <div className="text-4xl">{emoji || (role === 'parent' ? '👤' : '🧒')}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-lg">{name}</p>
            <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full capitalize">
              {role}
            </span>
          </div>
          <p className="text-xs text-white/40 truncate font-mono">{link}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleShare}
            className="px-3 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 border border-teal-400/40 text-sm font-medium transition-all"
            title="Share"
          >
            📤
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              copied
                ? 'bg-green-500/20 text-green-300 border-green-400/40'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </GlassCard>
  )
}

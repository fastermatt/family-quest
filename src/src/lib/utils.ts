import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const XP_LEVELS = [
  { level: 1, name: 'Rookie', xpRequired: 0 },
  { level: 2, name: 'Helper', xpRequired: 200 },
  { level: 3, name: 'Contributor', xpRequired: 500 },
  { level: 4, name: 'Achiever', xpRequired: 1000 },
  { level: 5, name: 'Go-Getter', xpRequired: 1800 },
  { level: 6, name: 'Star', xpRequired: 2800 },
  { level: 7, name: 'All-Star', xpRequired: 4000 },
  { level: 8, name: 'Champion', xpRequired: 5500 },
  { level: 9, name: 'Hero', xpRequired: 7500 },
  { level: 10, name: 'Legend', xpRequired: 10000 },
]

export function getLevelInfo(xp: number) {
  let currentLevel = XP_LEVELS[0]
  let nextLevel = XP_LEVELS[1]

  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].xpRequired) {
      currentLevel = XP_LEVELS[i]
      nextLevel = XP_LEVELS[i + 1] || XP_LEVELS[XP_LEVELS.length - 1]
    }
  }

  const progress = nextLevel.xpRequired > currentLevel.xpRequired
    ? ((xp - currentLevel.xpRequired) / (nextLevel.xpRequired - currentLevel.xpRequired)) * 100
    : 100

  return { currentLevel, nextLevel, progress: Math.min(progress, 100) }
}

export const AVATAR_EMOJIS = [
  '🦁', '🐯', '🐻', '🐼', '🦊', '🐺', '🦋', '🐸', '🦄', '🐉',
  '🦅', '🐬', '🦝', '🐙', '🦖'
]

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

export function isTodayRecurrence(
  recurrenceType: string,
  recurrenceDays: number[] | null | undefined
): boolean {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const dayOfMonth = today.getDate()

  switch (recurrenceType) {
    case 'daily':
      return true
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5
    case 'weekly':
      return recurrenceDays?.includes(dayOfWeek) ?? false
    case 'monthly':
      return recurrenceDays?.includes(dayOfMonth) ?? false
    case 'once':
      return false
    default:
      return false
  }
}

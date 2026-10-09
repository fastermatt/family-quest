// The family lives in one timezone. "Today" must mean the same thing for the
// browser, the daily cron and the evening summary — never UTC.
export const FAMILY_TZ = 'America/Denver'

interface ZonedParts {
  date: string // YYYY-MM-DD
  dayOfWeek: number // 0 = Sunday
  dayOfMonth: number
  minutes: number // minutes since local midnight
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function zonedParts(now: Date = new Date(), tz: string = FAMILY_TZ): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dayOfWeek: WEEKDAYS.indexOf(p.weekday),
    dayOfMonth: Number(p.day),
    minutes: Number(p.hour) * 60 + Number(p.minute),
  }
}

export function todayInTz(now: Date = new Date(), tz: string = FAMILY_TZ): string {
  return zonedParts(now, tz).date
}

/** Add whole days to a YYYY-MM-DD string (calendar math, no timezone drift). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

/** "HH:MM[:SS]" -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** "09:00:00" -> "9:00 AM" */
export function formatClock(time: string): string {
  const mins = timeToMinutes(time)
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

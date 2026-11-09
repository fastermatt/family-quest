import type { FamilySettings, TimeWindow } from './types.ts'

export const DEFAULT_SETTINGS: FamilySettings = {
  enabled: false, game_privilege_id: null, timezone: 'America/Denver', weekday_minutes: 120, weekend_minutes: 120,
  bathroom_bonus_minutes: 60, weekend_requires_chores: false, require_parent_approval: false,
  school_windows: [], gaming_windows: [], bedtime_windows: [], revision: 0,
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3))
export function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`)
  return value
}
export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`Enter ${label} (${max} characters maximum).`)
  return value.trim()
}
export function cleanWindows(raw: unknown): TimeWindow[] {
  if (!Array.isArray(raw) || raw.length > 21) throw new Error('Use up to 21 schedule windows.')
  return raw.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid schedule window.')
    const w = value as Record<string, unknown>
    if (!Array.isArray(w.days) || !w.days.length || w.days.length > 7 || w.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Choose the days for each window.')
    if (typeof w.start !== 'string' || typeof w.end !== 'string' || !clock.test(w.start) || !clock.test(w.end) || w.start === w.end) throw new Error('Choose different start and end times for each window.')
    return { days: [...new Set(w.days as number[])].sort(), start: w.start, end: w.end }
  })
}
export function cleanSettings(raw: unknown): FamilySettings {
  if (!raw || typeof raw !== 'object') throw new Error('Missing settings.')
  const b = raw as Record<string, unknown>
  for (const key of ['enabled', 'weekend_requires_chores', 'require_parent_approval']) if (typeof b[key] !== 'boolean') throw new Error('Choose each rule setting.')
  if (b.timezone !== 'America/Denver') throw new Error('This PC pilot currently supports America/Denver time.')
  if (b.game_privilege_id !== null && !UUID.test(String(b.game_privilege_id))) throw new Error('Choose the game reward to replace.')
  if (b.enabled && !b.game_privilege_id) throw new Error('Choose the game reward that these daily minutes replace.')
  return {
    game_privilege_id: b.game_privilege_id as string|null,
    enabled: b.enabled as boolean, timezone: 'America/Denver',
    weekday_minutes: integer(b.weekday_minutes, 0, 720, 'Weekday minutes'),
    weekend_minutes: integer(b.weekend_minutes, 0, 720, 'Weekend minutes'),
    bathroom_bonus_minutes: integer(b.bathroom_bonus_minutes, 0, 240, 'Bathroom bonus'),
    weekend_requires_chores: b.weekend_requires_chores as boolean,
    require_parent_approval: b.require_parent_approval as boolean,
    revision: integer(b.revision, 0, 2147483646, 'Rule revision'),
    school_windows: cleanWindows(b.school_windows), gaming_windows: cleanWindows(b.gaming_windows), bedtime_windows: cleanWindows(b.bedtime_windows),
  }
}
export function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short' }).formatToParts(now)
  const get = (key: string) => parts.find(p => p.type === key)!.value
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')), minute: Number(get('hour'))*60+Number(get('minute')) }
}
export function inWindow(w: TimeWindow, weekday: number, minute: number): boolean {
  const start = minutes(w.start), end = minutes(w.end)
  return start < end ? w.days.includes(weekday) && minute >= start && minute < end
    : (w.days.includes(weekday) && minute >= start) || (w.days.includes((weekday+6)%7) && minute < end)
}
function routine(s: FamilySettings, now: Date): string {
  const p = localParts(now, s.timezone)
  const matches = (windows: TimeWindow[]) => windows.some(w => inWindow(w, p.weekday, p.minute))
  if (matches(s.bedtime_windows)) return 'Bedtime — games are unavailable.'
  if (matches(s.school_windows)) return 'School time — learning and YouTube stay available.'
  if (s.gaming_windows.length && !matches(s.gaming_windows)) return 'Your gaming window has not opened.'
  return ''
}
/** Short lease clipped to the next minute-level routine boundary or local midnight. */
export function nextPolicyExpiry(s: FamilySettings, now: Date): string {
  const initial = routine(s, now), day = localParts(now, s.timezone).day
  const ceiling = now.getTime()+15*60_000
  for (let t = Math.floor(now.getTime()/60_000)*60_000+60_000; t <= ceiling; t += 60_000) {
    const d = new Date(t)
    if (localParts(d,s.timezone).day !== day || routine(s,d) !== initial) return d.toISOString()
  }
  return new Date(ceiling).toISOString()
}
export function gameDecision(s: FamilySettings, eligible: boolean, remaining: number, paused: boolean, now = new Date()) {
  const reason = !s.enabled ? 'Family game rules are not enabled.' : paused ? 'Games are paused by a parent.' : routine(s, now) || (!eligible ? 'Finish or correct your required responsibilities.' : remaining <= 0 ? 'Today’s earned game time is used up.' : 'Game time is ready in the PC pilot.')
  return { allowed: s.enabled && !paused && !routine(s,now) && eligible && remaining > 0, reason, nextChangeAt: nextPolicyExpiry(s,now) }
}

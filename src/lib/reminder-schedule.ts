import type { PushChore, PushPayload } from './push-copy'

export interface ReminderSchedule { id: string; child_id: string; time: string; enabled: boolean }
export const validReminderTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export const validReminderId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export function scheduledReminderPayload(name: string, chores: PushChore[], tag: string): PushPayload {
  const required = chores.filter(c => c.required)
  const left = required.filter(c => !['approved', 'submitted', 'excused'].includes(c.status)).length
  const waiting = required.filter(c => c.status === 'submitted').length
  if (left) return { title: `${left} ${left === 1 ? 'chore' : 'chores'} left today`, body: `${name}, keep going! One well-done job at a time.${waiting ? ` ${waiting} awaiting parent review.` : ''}`, url: '/home', tag }
  if (waiting) return { title: 'All your chores are turned in!', body: `Great effort, ${name}! Nothing left to submit today. ${waiting} ${waiting === 1 ? 'chore is' : 'chores are'} awaiting parent review.`, url: '/home', tag }
  if (!required.length) return { title: 'A little encouragement', body: `${name}, you have no required chores today. Thanks for finding ways to help!`, url: '/home', tag }
  return { title: 'You did it! All chores done', body: `Well done, ${name}! Your hard work helped the whole family today.`, url: '/home', tag }
}

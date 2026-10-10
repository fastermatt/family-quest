// Pure notification wording and chore math. No server imports so it can be unit tested.

export interface PushChore {
  name: string
  status: string
  required: boolean
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

export const isLeft = (c: PushChore) => c.required && (c.status === 'pending' || c.status === 'rejected')
export const leftOf = (cs: PushChore[]) => cs.filter(isLeft)

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function namesList(names: string[], max = 3): string {
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} and ${names.length - max} more` : shown
}

export function morningPayload(chores: PushChore[]): PushPayload | null {
  if (!chores.length) return null
  const first = leftOf(chores)[0] ?? chores[0]
  return {
    title: "Today's chores are ready",
    body: `${plural(chores.length, 'chore', 'chores')} today. Start with: ${first.name}.`,
    url: '/home',
    tag: 'remind-morning',
  }
}

export function afternoonPayload(chores: PushChore[]): PushPayload | null {
  const left = leftOf(chores).length
  if (!left) return null
  return {
    title: `${plural(left, 'chore', 'chores')} left`,
    body: "Finish before 4:00. Rewards stay locked until they're done.",
    url: '/home',
    tag: 'remind-afternoon',
  }
}

export function fourKidPayload(chores: PushChore[]): PushPayload | null {
  const left = leftOf(chores).length
  if (!left) return null
  return {
    title: "It's after 4",
    body: `${plural(left, 'chore', 'chores')} still not done.`,
    url: '/home',
    tag: 'remind-four',
  }
}

export function fourParentPayload(kid: string, chores: PushChore[]): PushPayload | null {
  const left = leftOf(chores)
  if (!left.length) return null
  return {
    title: `${kid} still has ${plural(left.length, 'chore', 'chores')}`,
    body: namesList(left.map((c) => c.name)),
    url: '/dashboard',
    tag: `remind-four-parent-${kid}`,
  }
}

export function eveningPayload(kid: string, chores: PushChore[], hasAnswer: boolean): PushPayload | null {
  if (!chores.length) return null
  const done = chores.filter((c) => c.status === 'approved' || c.status === 'submitted').length
  const missed = chores.filter((c) => isLeft(c) || c.status === 'missed').map((c) => c.name)
  const parts = [`${plural(done, 'chore', 'chores')} shown.`]
  if (missed.length) parts.push(`Not done: ${namesList(missed)}.`)
  if (hasAnswer) parts.push("Read his answer to today's question.")
  return {
    title: `${kid}: ${done} of ${chores.length} done today`,
    body: parts.join(' '),
    url: '/dashboard',
    tag: `remind-evening-${kid}`,
  }
}

export function submitBody(proofType: string): string {
  switch (proofType) {
    case 'photo':
      return 'Photo is in. Tap to check it.'
    case 'written':
      return 'He wrote his answers. Tap to read.'
    case 'imessage_video':
      return 'Check Messages for his video, then approve.'
    default:
      return 'Says it’s done. Tap to confirm.'
  }
}

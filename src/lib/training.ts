// Grey's daily calisthenics log: what he trained, what he worked on, and one win.
// Rest days count too: knowing when to rest is part of discipline.

export const TRAINING_XP = 50

export const SKILLS = [
  'Handstand',
  'Planche',
  'Front lever',
  'Back lever',
  'Muscle-up',
  'Human flag',
  'Pull-ups',
  'Push-ups',
  'Dips',
  'L-sit',
  'Pistol squats',
  'Core',
  'Flexibility',
  'Other',
] as const

// The "win" question rotates so it stays fun.
export const WIN_PROMPTS = [
  'What did you crush today?',
  'Any new personal record? How many reps or seconds?',
  'What felt easier than last week?',
  'What move are you closest to landing?',
  'What was the hardest set, and did you finish it?',
  'What would a coach say you did well today?',
  'What did you do one more time even though you were tired?',
  'What progress would you show off in a video?',
  'Which skill are you most proud of right now?',
  'What did you push through today?',
  'What is your next goal, and what did you do today to get closer?',
  'Did you hold anything longer than before? How long?',
] as const

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function winPromptFor(isoDate: string): string {
  const n = dayNumber(isoDate)
  return WIN_PROMPTS[((n % WIN_PROMPTS.length) + WIN_PROMPTS.length) % WIN_PROMPTS.length]
}

function text(v: unknown, max: number) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export interface TrainingValues {
  rest_day: boolean
  skills: string[]
  worked_on: string | null
  win: string | null
}

/** Validate a log. Errors are written for a kid. */
export function cleanTraining(input: Record<string, unknown>): { values?: TrainingValues; error?: string } {
  if (input.rest_day === true) {
    return { values: { rest_day: true, skills: [], worked_on: null, win: text(input.win, 500) || null } }
  }
  const skills = Array.isArray(input.skills)
    ? [...new Set(input.skills.filter((s): s is string => typeof s === 'string' && (SKILLS as readonly string[]).includes(s)))]
    : []
  if (!skills.length) return { error: 'Pick at least one thing you trained.' }
  const worked_on = text(input.worked_on, 500)
  if (worked_on.length < 8) return { error: 'Tell us what you worked on. Sets, reps or seconds.' }
  const win = text(input.win, 500)
  if (win.length < 5) return { error: 'Tell us your win for today.' }
  return { values: { rest_day: false, skills, worked_on, win } }
}

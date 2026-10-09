// One question a day for Grey to answer in his own words. The list rotates by
// date, so everyone in the family sees the same question all day, and it takes
// about six weeks before a question comes back.

export const REFLECTION_XP = 50
export const REFLECTION_MIN_CHARS = 15

export const QUESTIONS: string[] = [
  'What did you learn today?',
  'What was the hardest chore today, and how did you get it done?',
  'What are you learning about discipline?',
  'How do you see yourself growing lately?',
  'What is one thing you did today without being asked?',
  'When did you want to quit today? What did you do instead?',
  'What is something you are proud of from today?',
  'What chore are you getting faster or better at?',
  'What would you do differently if you could redo today?',
  'Who did you help today, and how?',
  'What is one thing that made today a good day?',
  'What did you do today that future you will be glad about?',
  'What is something hard you are practicing right now? How is it going?',
  'What is the difference between doing a chore and doing it well?',
  'What did you notice about yourself on piano today?',
  'What distracted you today, and how did you handle it?',
  'What is one promise you kept today?',
  'What did you do first today, and why?',
  'What is something new you tried or figured out today?',
  'How did you show respect to Mom or Dad today?',
  'What is a habit you want to build? What is your first step?',
  'What is something you used to find hard that is easier now?',
  'If you were the parent, what chore would you add, and why?',
  'What did you do today when nobody was watching?',
  'What made you laugh today?',
  'What is something you are thankful for today?',
  'What is one goal for tomorrow?',
  'What did the chickens, the dog or someone else need from you today?',
  'What does being responsible mean to you?',
  'What is one thing you finished today that you did not feel like doing?',
  'What would make tomorrow better than today?',
  'What did you read today, and what stuck with you?',
  'What is one way you are more grown up than last year?',
  'What is the best thing you said or did for someone today?',
  'What did you do today that took courage?',
  'What does doing your best look like for you?',
  'What is one mistake you made this week, and what did it teach you?',
  'What are you looking forward to, and what do you need to do to get there?',
  'How did you use your free time today? Would you change anything?',
  'What do you want Mom and Dad to know about your day?',
  'How is training calisthenics teaching you discipline?',
  'What skill took the longest to learn? What kept you going?',
  'How is getting stronger like getting your chores done every day?',
  'What would you tell a younger kid who wants to learn a planche or a muscle-up?',
]

/** Days since 1970 for a YYYY-MM-DD date (calendar arithmetic, no time zone). */
function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** The question for a given family date (YYYY-MM-DD in America/Denver). */
export function questionFor(isoDate: string): string {
  const n = dayNumber(isoDate)
  return QUESTIONS[((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length]
}

/** Clean up an answer. Returns an error message a kid can understand. */
export function cleanAnswer(raw: unknown): { answer?: string; error?: string } {
  const answer = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 1000) : ''
  if (answer.length < REFLECTION_MIN_CHARS) return { error: 'Write a little more. A full sentence or two.' }
  return { answer }
}

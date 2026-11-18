import { requireChild } from '@/lib/api-auth'
import { loadChildToday } from '@/lib/child-today'
import ChildToday, { type Today } from './child-today-screen'

// Load today's chores while the page renders on the server. The screen still
// refreshes itself from /api/child/today afterwards, exactly as before; if this
// first load fails for any reason the screen simply fetches on its own.
export default async function HomePage() {
  let initialToday: Today | undefined
  try {
    const auth = await requireChild()
    if (!auth.error) initialToday = (await loadChildToday(auth.me, auth.admin)) as Today
  } catch {
    initialToday = undefined
  }
  return <ChildToday initialToday={initialToday} />
}

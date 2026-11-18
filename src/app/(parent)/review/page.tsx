import { ParentToday, type Overview } from '@/components/chores/parent-today'
import { initialParentOverview } from '@/lib/parent-overview'

// The evening email links here; review lives on the Today screen.
export default async function ReviewPage() {
  const initialOverview = (await initialParentOverview()) as Overview | undefined
  return <ParentToday initialOverview={initialOverview} />
}

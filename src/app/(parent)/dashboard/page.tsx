import { ParentToday, type Overview } from '@/components/chores/parent-today'
import { initialParentOverview } from '@/lib/parent-overview'

export default async function DashboardPage() {
  const initialOverview = (await initialParentOverview()) as Overview | undefined
  return <ParentToday initialOverview={initialOverview} />
}

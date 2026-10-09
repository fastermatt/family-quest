import { redirect } from 'next/navigation'

// Chores and rewards are managed on one screen now.
export default function Page() {
  redirect('/tasks')
}

import { NextResponse } from 'next/server'
import { requireChild } from '@/lib/api-auth'
import { loadChildToday } from '@/lib/child-today'

export const dynamic = 'force-dynamic'

// Grey's whole day: chores, what is locked, what he has asked for.
export async function GET() {
  const auth = await requireChild()
  if (auth.error) return auth.error
  return NextResponse.json(await loadChildToday(auth.me, auth.admin))
}

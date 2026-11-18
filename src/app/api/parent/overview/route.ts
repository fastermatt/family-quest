import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { loadParentOverview } from '@/lib/parent-overview'

export const dynamic = 'force-dynamic'

// Everything the parent "Today" screen needs in one call.
export async function GET() {
  const auth = await requireParent()
  if (auth.error) return auth.error
  return NextResponse.json(await loadParentOverview(auth.me, auth.admin))
}

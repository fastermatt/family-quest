import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { generateTaskInstances } from '@/lib/generate'

export const dynamic = 'force-dynamic'

// Vercel Cron: `Authorization: Bearer $CRON_SECRET`. Runs each morning.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ success: true, ...(await generateTaskInstances(adminClient())) })
  } catch (error) {
    console.error('cron generate failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

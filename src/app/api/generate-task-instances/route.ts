import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { generateTaskInstances } from '@/lib/generate'

export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  try {
    const result = await generateTaskInstances(admin())
    return NextResponse.json({
      success: true,
      created: result.created,
      closedOut: result.closedOut,
      message: `Created ${result.created} chores for ${result.date}`,
    })
  } catch (error) {
    console.error('Error generating task instances:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// The parent's "Make today's list now" button, or an external scheduler.
export async function POST(request: NextRequest) {
  if (!isCron(request)) {
    const auth = await requireParent()
    if (auth.error) return auth.error
  }
  return run()
}

import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { cleanInventory, sha256 } from '@/lib/companion/pairing'

export const dynamic = 'force-dynamic'

// Stage 1: the PC reports what it is. One small update per report, no logs yet.
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not paired.' }, { status: 401 })

  const raw = await req.text()
  if (raw.length > 8192) return NextResponse.json({ error: 'Report too large.' }, { status: 413 })
  let body: unknown = {}
  try {
    body = JSON.parse(raw)
  } catch {}

  const admin = adminClient()
  const { data, error } = await admin
    .from('companion_devices')
    .update({ inventory: cleanInventory(body), last_seen_at: new Date().toISOString() })
    .eq('token_hash', sha256(token))
    .is('revoked_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'This PC is not linked any more.' }, { status: 401 })
  return NextResponse.json({ ok: true })
}

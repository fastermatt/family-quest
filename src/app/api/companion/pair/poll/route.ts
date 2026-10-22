import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { safeEqualHex, sha256 } from '@/lib/companion/pairing'

export const dynamic = 'force-dynamic'

// The PC checks whether a parent entered its code. When approved, the device
// token comes back exactly once and is erased from the pairing row.
export async function POST(req: NextRequest) {
  const admin = adminClient()
  const body = await req.json().catch(() => ({}))
  const pairId = typeof body.pairId === 'string' ? body.pairId : ''
  const pollSecret = typeof body.pollSecret === 'string' ? body.pollSecret : ''
  if (!pairId || !pollSecret) return NextResponse.json({ error: 'Missing pairing details.' }, { status: 400 })

  const { data: row } = await admin
    .from('companion_pairings')
    .select('id, poll_hash, expires_at, consumed, family_id, pending_token')
    .eq('id', pairId)
    .maybeSingle()
  if (!row || !safeEqualHex(row.poll_hash, sha256(pollSecret))) {
    return NextResponse.json({ error: 'Unknown pairing.' }, { status: 404 })
  }
  if (row.consumed) return NextResponse.json({ status: 'done' })
  if (new Date(row.expires_at).getTime() < Date.now()) return NextResponse.json({ status: 'expired' }, { status: 410 })
  if (!row.family_id || !row.pending_token) return NextResponse.json({ status: 'waiting' })

  // Hand over the token once; the update only succeeds for whoever clears it first.
  const { data: claimed } = await admin
    .from('companion_pairings')
    .update({ pending_token: null, consumed: true })
    .eq('id', row.id)
    .eq('consumed', false)
    .select('id')
  if (!claimed?.length) return NextResponse.json({ status: 'done' })
  return NextResponse.json({ status: 'approved', deviceToken: row.pending_token })
}

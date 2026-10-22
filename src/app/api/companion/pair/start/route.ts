import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { MAX_PENDING_PAIRINGS, PAIR_TTL_MS, generateCode, newSecret, sha256 } from '@/lib/companion/pairing'

export const dynamic = 'force-dynamic'

// The PC asks for a pairing code. Public on purpose (the PC has nothing yet),
// so it is capped: at most MAX_PENDING_PAIRINGS live codes at once, 10 minutes each.
export async function POST(req: NextRequest) {
  const admin = adminClient()
  const body = await req.json().catch(() => ({}))
  const deviceName =
    typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Windows PC' : 'Windows PC'

  const now = new Date()
  // Tidy up old attempts (best effort).
  await admin.from('companion_pairings').delete().lt('expires_at', new Date(now.getTime() - 3600_000).toISOString())

  const { count } = await admin
    .from('companion_pairings')
    .select('id', { count: 'exact', head: true })
    .gt('expires_at', now.toISOString())
    .eq('consumed', false)
  if ((count ?? 0) >= MAX_PENDING_PAIRINGS) {
    return NextResponse.json({ error: 'Busy. Try again in a few minutes.' }, { status: 429 })
  }

  const code = generateCode()
  const pollSecret = newSecret()
  const { data, error } = await admin
    .from('companion_pairings')
    .insert({
      code_hash: sha256(code),
      poll_hash: sha256(pollSecret),
      device_name: deviceName,
      expires_at: new Date(now.getTime() + PAIR_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Could not start pairing.' }, { status: 500 })

  return NextResponse.json({ pairId: data.id, code, pollSecret, expiresInSeconds: PAIR_TTL_MS / 1000 })
}

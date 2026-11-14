import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { cleanCode, newSecret, sha256 } from '@/lib/companion/pairing'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { data, error } = await admin
    .from('companion_devices')
    .select('id, name, inventory, last_seen_at, created_at')
    .eq('family_id', me.family_id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) return bad(error.message, 500)
  return NextResponse.json({ devices: data ?? [] })
}

// A parent types the 6-digit code shown on the PC.
export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  const code = cleanCode(body.code)
  if (!code) return bad('Enter the 6 digits shown on the PC.')

  const { data: pairing } = await admin
    .from('companion_pairings')
    .select('id, device_name')
    .eq('code_hash', sha256(code))
    .is('family_id', null)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!pairing) return bad('That code did not match. Check the PC screen and try again.', 404)

  const token = newSecret()
  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : pairing.device_name
  const { data: device, error } = await admin
    .from('companion_devices')
    .insert({ family_id: me.family_id, name, token_hash: sha256(token), created_by: me.id })
    .select('id')
    .single()
  if (error || !device) return bad('Could not link the PC.', 500)

  // Only one parent request can claim the pairing row.
  const { data: claimed } = await admin
    .from('companion_pairings')
    .update({
      family_id: me.family_id,
      device_id: device.id,
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      pending_token: token,
    })
    .eq('id', pairing.id)
    .is('family_id', null)
    .select('id')
  if (!claimed?.length) {
    await admin.from('companion_devices').delete().eq('id', device.id)
    return bad('That code was already used.', 409)
  }
  return NextResponse.json({ ok: true, deviceId: device.id })
}

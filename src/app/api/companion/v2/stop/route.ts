import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { desktopIdentity, limitedJson, desktopError } from '@/lib/companion/desktop-server'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
 try {
  const client = await desktopIdentity(req)
  if (!client) return desktopError('not_linked', 401)
  const body = await limitedJson(req, 256) as {pin?:unknown}
  if (!body || typeof body !== 'object' || typeof body.pin !== 'string' || !/^(?:[0-9]{4})?$/.test(body.pin)) return desktopError('invalid_pin', 400)
  const {data,error} = await adminClient().rpc('companion_verify_stop', {p_client:client.id,p_pin:body.pin})
  if (error) return desktopError('verification_unavailable', 503)
  if (data === 'throttled') return desktopError('throttled', 429)
  if (data === 'wrong_pin') return desktopError('wrong_pin', 403)
  if (data !== 'allowed') return desktopError('verification_unavailable', 503)
  const {error: presenceError} = await adminClient().rpc('companion_presence_stop', {p_client:client.id})
  if (presenceError) return desktopError('presence_unavailable', 503)
  return NextResponse.json({ok:true}, {headers:{'Cache-Control':'no-store'}})
 } catch { return desktopError('verification_unavailable', 503) }
}

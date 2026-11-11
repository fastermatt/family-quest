import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { sendToProfiles } from '@/lib/push'
import { isPresenceEvent, presencePushPayload } from '@/lib/companion/presence'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
const unavailable = () => NextResponse.json({ error: 'Presence monitor unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? ''
  const match = /^Bearer ([\x21-\x7e]{32,256})$/.exec(authorization)
  if (!match) return unauthorized()

  try {
    const admin = adminClient()
    const { data: authorized, error: authError } = await admin.rpc('companion_presence_authorized', { p_token: match[1] })
    if (authError) return unavailable()
    if (authorized !== true) return unauthorized()

    const { error: scanError } = await admin.rpc('companion_presence_scan')
    if (scanError) return unavailable()
    const { data, error: claimError } = await admin.rpc('companion_presence_claim')
    if (claimError || (data !== null && !Array.isArray(data))) return unavailable()

    const rows = data ?? []
    const events = rows.filter(isPresenceEvent)
    let pushDelivered = 0
    let updateFailed = false
    let next = 0
    const deliverNext = async () => {
      for (;;) {
        const index = next++
        if (index >= events.length) return
        const event = events[index]
        let delivered = 0
        try {
          const count = await sendToProfiles(admin, [event.notify_parent_id], presencePushPayload(event))
          delivered = Number.isSafeInteger(count) && count >= 0 ? count : 0
        } catch {
          // Push is best effort; the event remains visible in the parent notice list.
        }
        try {
          const { error: updateError } = await admin.from('companion_presence_events')
            .update({ push_delivered: delivered })
            .eq('id', event.id)
            .eq('family_id', event.family_id)
            .eq('child_id', event.child_id)
          if (updateError) updateFailed = true
          else pushDelivered += delivered
        } catch {
          updateFailed = true
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(5, events.length) }, deliverNext))
    if (updateFailed) return unavailable()
    return NextResponse.json({ ok: true, eventsClaimed: rows.length, pushDelivered }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return unavailable()
  }
}

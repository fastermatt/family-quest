import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { desktopIdentity, limitedJson, desktopError } from '@/lib/companion/desktop-server'
import { MAX_BROWSE_BODY_BYTES, normalizeBrowsePayload } from '@/lib/companion/browsing'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const client = await desktopIdentity(req)
    if (!client) return desktopError('Link expired or revoked.', 401)
    const payload = normalizeBrowsePayload(await limitedJson(req, MAX_BROWSE_BODY_BYTES))
    const { error } = await adminClient().from('companion_browse_history').upsert({
      family_id: client.family_id,
      child_id: client.child_id,
      day: payload.day,
      entries: payload.entries,
      coverage: payload.coverage,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'family_id,child_id,day' })
    if (error) return desktopError('Could not save browser history.', 503)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return desktopError(error)
  }
}

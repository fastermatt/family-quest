import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { sha256 } from '@/lib/companion/pairing'
import { MAX_UPLOAD_BYTES, MIN_UPLOAD_GAP_MS, RETENTION_DAYS, cleanUsage } from '@/lib/companion/usage'

export const dynamic = 'force-dynamic'

// One small summary per PC about once an hour. Capped so a PC can never flood the database:
// 16 KB per upload, one upload per 5 minutes, top 200 domains, 14 days kept.
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Not paired.' }, { status: 401 })

  const raw = await req.text()
  if (raw.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'Upload too large.' }, { status: 413 })
  let body: unknown = {}
  try {
    body = JSON.parse(raw)
  } catch {}

  const admin = adminClient()
  const { data: dev } = await admin
    .from('companion_devices')
    .select('id, family_id, last_usage_at')
    .eq('token_hash', sha256(token))
    .is('revoked_at', null)
    .maybeSingle()
  if (!dev) return NextResponse.json({ error: 'This PC is not linked any more.' }, { status: 401 })

  const now = new Date()
  if (dev.last_usage_at) {
    const wait = MIN_UPLOAD_GAP_MS - (+now - +new Date(dev.last_usage_at))
    if (wait > 0) {
      return NextResponse.json({ error: 'Too soon.', retryAfterSeconds: Math.ceil(wait / 1000) }, { status: 429 })
    }
  }

  const c = cleanUsage(body, now)
  if (!c.values) return NextResponse.json({ error: c.error }, { status: 400 })

  const { error } = await admin.from('companion_usage').upsert(
    {
      device_id: dev.id,
      family_id: dev.family_id,
      period_start: c.values.periodStart,
      period_end: c.values.periodEnd,
      domains: c.values.domains,
      other_count: c.values.other,
      total_count: c.values.total,
    },
    { onConflict: 'device_id,period_start', ignoreDuplicates: true }
  )
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })

  const stamp = now.toISOString()
  await admin.from('companion_devices').update({ last_usage_at: stamp, last_seen_at: stamp }).eq('id', dev.id)
  // Retention without a scheduled job: trim this PC's old rows as it uploads.
  await admin
    .from('companion_usage')
    .delete()
    .eq('device_id', dev.id)
    .lt('period_end', new Date(+now - RETENTION_DAYS * 86400_000).toISOString())

  return NextResponse.json({ ok: true })
}

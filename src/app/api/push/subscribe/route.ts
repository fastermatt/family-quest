import { NextRequest, NextResponse } from 'next/server'
import { adminClient, getSessionProfile } from '@/lib/session'
import { bad } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const me = await getSessionProfile()
  if (!me) return bad('Please sign in again.', 401)
  const body = await req.json().catch(() => null)
  const sub = body?.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) return bad('Bad subscription.')
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) return bad('Bad subscription.')

  const admin = adminClient()
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
  const { error } = await admin.from('push_subscriptions').insert({
    profile_id: me.id,
    endpoint,
    p256dh,
    auth,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
  })
  if (error) {
    console.error('push subscribe failed:', error.message)
    return bad('Could not save reminders. Try again.', 500)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const me = await getSessionProfile()
  if (!me) return bad('Please sign in again.', 401)
  const body = await req.json().catch(() => null)
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || !endpoint) return bad('Missing endpoint.')
  await adminClient().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('profile_id', me.id)
  return NextResponse.json({ ok: true })
}

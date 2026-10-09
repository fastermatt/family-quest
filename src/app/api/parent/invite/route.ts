import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { bad, requireParent } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const HOURS = 48

// A one-time link that lets a family member choose their own PIN.
export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  const profileId = body?.profileId
  if (typeof profileId !== 'string') return bad('Who is the link for?')

  const { data: target } = await admin
    .from('profiles')
    .select('id, name')
    .eq('id', profileId)
    .eq('family_id', me.family_id)
    .maybeSingle()
  if (!target) return bad('Not in your family.', 404)

  const token = randomBytes(24).toString('base64url')
  const expires = new Date(Date.now() + HOURS * 3600 * 1000).toISOString()
  const { error } = await admin
    .from('profiles')
    .update({ join_token: token, join_token_expires_at: expires })
    .eq('id', target.id)
  if (error) return bad(error.message, 500)

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  return NextResponse.json({ url: `${origin}/setup-pin?token=${token}`, name: target.name, expiresInHours: HOURS })
}

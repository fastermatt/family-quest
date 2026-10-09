import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { adminClient } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Public: validates a one-time invite token, then the person picks their PIN.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const profile = await findByToken(token)
  if (!profile) return NextResponse.json({ error: 'This link has expired or was already used. Ask for a new one.' }, { status: 410 })
  return NextResponse.json({ name: profile.name, emoji: profile.avatar_emoji })
}

export async function POST(req: NextRequest) {
  const { token, pin } = await req.json().catch(() => ({}))
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Pick 4 digits.' }, { status: 400 })
  }
  const profile = await findByToken(typeof token === 'string' ? token : '')
  if (!profile) return NextResponse.json({ error: 'This link has expired or was already used. Ask for a new one.' }, { status: 410 })

  const hash = await bcrypt.hash(pin, 10)
  const admin = adminClient()
  // Clearing the token in the same update makes the link single-use.
  const { data, error } = await admin
    .from('profiles')
    .update({ pin_hash: hash, join_token: null, join_token_expires_at: null })
    .eq('id', profile.id)
    .eq('join_token', token)
    .select('access_token, role')
  if (error || !data?.length) return NextResponse.json({ error: 'Could not save. Try the link again.' }, { status: 409 })

  const res = NextResponse.json({ ok: true, role: data[0].role })
  res.cookies.set('profile_token', data[0].access_token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}

async function findByToken(token: string) {
  if (token.length < 20) return null
  const { data } = await adminClient()
    .from('profiles')
    .select('id, name, avatar_emoji, join_token_expires_at')
    .eq('join_token', token)
    .maybeSingle()
  if (!data || !data.join_token_expires_at || new Date(data.join_token_expires_at) < new Date()) return null
  return data
}

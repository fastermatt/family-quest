import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/session'
import * as bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { profileId, pin } = await req.json()

  if (!profileId || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }

  // Works for PIN sessions and email logins alike.
  const me = await getSessionProfile()
  if (!me || me.role !== 'parent') {
    return NextResponse.json({ error: 'Only parents can set PINs' }, { status: 403 })
  }
  const caller = { family_id: me.family_id }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify the target profile is in the same family
  const { data: target } = await supabase
    .from('profiles')
    .select('id, family_id')
    .eq('id', profileId)
    .eq('family_id', caller.family_id)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const hash = await bcrypt.hash(pin, 10)
  await supabase.from('profiles').update({ pin_hash: hash }).eq('id', profileId)

  return NextResponse.json({ ok: true })
}

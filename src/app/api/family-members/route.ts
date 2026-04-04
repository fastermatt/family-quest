import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all family members (single family app — get from the one family)
  const { data: families } = await supabase.from('families').select('id').limit(1)
  const familyId = families?.[0]?.id
  if (!familyId) return NextResponse.json([])

  const { data: members } = await supabase
    .from('profiles')
    .select('id, name, role, avatar_emoji, pin_hash')
    .eq('family_id', familyId)
    .order('role', { ascending: false }) // parents last, children first
    .order('name', { ascending: true })

  // Never expose pin_hash to client — just expose whether a PIN exists
  const safe = (members || []).map(m => ({
    id: m.id,
    name: m.name,
    role: m.role,
    avatar_emoji: m.avatar_emoji,
    has_pin: !!m.pin_hash,
  }))

  return NextResponse.json(safe)
}

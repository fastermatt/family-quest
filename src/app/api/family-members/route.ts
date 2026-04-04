import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Returns the family member list for the LOGIN screen.
// Only exposes: id, name, role, avatar_emoji, has_pin — never pin_hash or access_token.
// Resolves the family from the caller's existing session cookie if present,
// or from a ?family_id= query param (for multi-family: families have a shareable ID in their URL).
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let familyId: string | null = null

  // Option 1: caller already has a session — use their family
  const cookieStore = await cookies()
  const profileToken = cookieStore.get('profile_token')?.value
  if (profileToken) {
    const { data } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('access_token', profileToken)
      .single()
    familyId = data?.family_id ?? null
  }

  // Option 2: family_id passed explicitly (e.g. from a family invite URL)
  if (!familyId) {
    const param = req.nextUrl.searchParams.get('family_id')
    if (param && /^[0-9a-f-]{36}$/.test(param)) {
      // Verify this family exists before trusting the param
      const { data } = await supabase
        .from('families')
        .select('id')
        .eq('id', param)
        .single()
      familyId = data?.id ?? null
    }
  }

  // Option 3: single-family mode (only one family in the DB — current state)
  // This is ONLY safe for single-tenant. Will be removed when onboarding is built.
  if (!familyId) {
    const { count } = await supabase
      .from('families')
      .select('id', { count: 'exact', head: true })
    
    if (count === 1) {
      const { data } = await supabase.from('families').select('id').single()
      familyId = data?.id ?? null
    }
    // If count > 1 and no session/param: can't determine family — return empty
    // The login page will need to ask for a family code
  }

  if (!familyId) {
    return NextResponse.json({ error: 'Family not found. Use your family invite link.' }, { status: 404 })
  }

  const { data: members } = await supabase
    .from('profiles')
    .select('id, name, role, avatar_emoji, pin_hash')
    .eq('family_id', familyId)
    .order('role', { ascending: false })
    .order('name', { ascending: true })

  // Strip pin_hash — only expose whether a PIN is set
  const safe = (members || []).map(m => ({
    id: m.id,
    name: m.name,
    role: m.role,
    avatar_emoji: m.avatar_emoji,
    has_pin: !!m.pin_hash,
  }))

  return NextResponse.json(safe)
}

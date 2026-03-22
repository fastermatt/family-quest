import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { familyName, children } = await req.json()

  // Verify the user is authenticated via their cookie session
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {}, // read-only here
      },
    }
  )

  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use service role client to bypass RLS for the initial setup
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Create family
  const { data: family, error: familyError } = await supabaseAdmin
    .from('families')
    .insert([{ name: familyName, family_xp: 0, family_level: 1 }])
    .select()
    .single()

  if (familyError) {
    return NextResponse.json({ error: familyError.message }, { status: 500 })
  }

  // Create parent profile linked to this authenticated user
  const { error: parentError } = await supabaseAdmin
    .from('profiles')
    .insert([{
      family_id: family.id,
      auth_user_id: user.id,
      name: 'Parent',
      role: 'parent',
      avatar_emoji: '👨‍👩‍👧‍👦',
    }])

  if (parentError) {
    return NextResponse.json({ error: parentError.message }, { status: 500 })
  }

  // Create child profiles
  for (const child of children) {
    const { error: childError } = await supabaseAdmin
      .from('profiles')
      .insert([{
        family_id: family.id,
        name: child.name,
        role: 'child',
        avatar_emoji: child.avatar,
      }])

    if (childError) {
      return NextResponse.json({ error: childError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

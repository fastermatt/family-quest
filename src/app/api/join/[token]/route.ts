import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, name, avatar_emoji')
    .eq('access_token', token)
    .single()

  if (!profile) {
    return NextResponse.redirect(new URL('/login?error=invalid-link', req.url))
  }

  if (profile.role === 'child') {
    // For children, redirect to /child-login?token=XXX so the client-side page
    // can save the token to localStorage — this ensures the PWA remembers them
    // even after a cold launch when cookies are not shared across iOS contexts.
    return NextResponse.redirect(new URL(`/child-login?token=${token}`, req.url))
  }

  // Parents: set cookie and go straight to dashboard
  const response = NextResponse.redirect(new URL('/dashboard', req.url))
  response.cookies.set('profile_token', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}

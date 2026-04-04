import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isPublic =
    pathname === '/login' ||
    pathname === '/family-login' ||
    pathname === '/child-login' ||
    pathname.startsWith('/auth/') ||
    pathname === '/family/setup' ||
    pathname.startsWith('/api/join/') ||
    pathname === '/api/pin-login' ||
    pathname === '/api/family-members' ||
    pathname === '/api/set-child-token' ||
    pathname === '/api/test-suite'

  if (!user && !isPublic) {
    // Allow access if user has a persistent profile_token cookie
    const profileToken = request.cookies.get('profile_token')?.value
    if (!profileToken) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Has a token — let the layout validate it
    return supabaseResponse
  }

  if (user && pathname === '/login') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    // New user with no profile yet — send to family setup
    if (!profile) {
      return NextResponse.redirect(new URL('/family/setup', request.url))
    }

    const dest = profile.role === 'child' ? '/home' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
}

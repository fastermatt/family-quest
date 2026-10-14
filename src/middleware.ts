import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { middlewareAccess } from './lib/middleware-access'
import { timeoutFetch, withTimeout } from './lib/request-timeout'

function denied(request: NextRequest) {
  return request.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    : NextResponse.redirect(new URL('/family-login', request.url))
}

export async function middleware(request: NextRequest) {
  const access = middlewareAccess(request.nextUrl.pathname, request.cookies.getAll())
  if (access === 'pass') return NextResponse.next({ request })
  if (access === 'deny') return denied(request)
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch(4000) },
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

  try {
    const result = await withTimeout(supabase.auth.getUser(), 6000)
    if (result.error && (result.error.status === 504 || result.error.name === 'AuthRetryableFetchError')) throw result.error
    if (!result.data.user) return denied(request)
    return supabaseResponse
  } catch {
    // Keep protected pages closed, preserve session cookies, and allow a retry.
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again shortly.' }, { status: 503, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } })
  }

}

export const config = {
  // Skip static files (the logo, icons, manifest) so signed-out screens can load them.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
}

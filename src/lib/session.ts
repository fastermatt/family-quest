import { timeoutFetch } from '@/lib/request-timeout'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { cache } from 'react'

export interface SessionProfile {
  id: string
  role: 'parent' | 'child'
  family_id: string
}

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: timeoutFetch(6000) } }
  )
}

/**
 * Who is calling? A PIN/link profile token first, then a parent's login.
 * Memoized per request (React.cache), so a layout, page and helpers that all
 * ask share one lookup instead of each going back to the database.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const admin = adminClient()
  const cookieStore = await cookies()

  const token = cookieStore.get('profile_token')?.value
  if (token) {
    const { data } = await admin
      .from('profiles')
      .select('id, role, family_id')
      .eq('access_token', token)
      .single()
    if (data) return data as SessionProfile
  }

  // getClaims verifies the login token's signature locally against the
  // project's published signing keys (cached), instead of a round trip to the
  // Auth server on every call like getUser. It falls back to getUser itself
  // when a token was signed with the legacy shared secret.
  const authClient = await createServerClient()
  const { data: claimsData } = await authClient.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return null

  const { data } = await admin
    .from('profiles')
    .select('id, role, family_id')
    .eq('auth_user_id', userId)
    .single()
  return (data as SessionProfile) ?? null
})

/**
 * GET /api/test-suite
 * 
 * Automated test suite for auth, access control, and data isolation.
 * REMOVE THIS ROUTE BEFORE GOING TO PRODUCTION.
 * Only accessible with ?secret=CHOREZAP_TEST_SECRET env var.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://family-tasks-deploy.vercel.app'

// ── Test IDs (seeded in DB) ────────────────────────────────────────────────────
const CARLSON_FAMILY_ID    = '7059b2ec-bfef-4a3f-9d29-5a44be5c2eb9'
const GREY_PROFILE_ID      = '48c5ec41-91db-4399-b1ea-6498de40a67a'
const GREY_TOKEN           = '024ff319-e319-40cf-aa0a-a6ffddc539b3'
const DAD_PROFILE_ID       = '0316c090-917f-4835-b7c9-3304dc221afa'
const DAD_TOKEN            = '1e196efd-ac70-4914-979a-b994142db8a6'

const SMITH_FAMILY_ID      = 'aaaaaaaa-0000-0000-0000-000000000001'
const SMITH_KID_ID         = 'bbbbbbbb-0000-0000-0000-000000000001'
const SMITH_KID_TOKEN      = 'bbbbbbbb-aaaa-0000-0000-000000000001'
const SMITH_PARENT_TOKEN   = 'bbbbbbbb-aaaa-0000-0000-000000000002'
const SMITH_KID_TASK_ID    = 'dddddddd-0000-0000-0000-000000000001'

type TestResult = {
  name: string
  passed: boolean
  detail?: string
}

// ── Helper: call an API route with a fake cookie session ─────────────────────
async function apiCall(
  path: string,
  opts: {
    method?: string
    body?: object
    profileToken?: string
    activeProfileId?: string
  } = {}
): Promise<{ status: number; body: any }> {
  const cookies: string[] = []
  if (opts.profileToken) cookies.push(`profile_token=${opts.profileToken}`)
  if (opts.activeProfileId) cookies.push(`active_profile_id=${opts.activeProfileId}`)

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  let body: any
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

// ── Test runner ───────────────────────────────────────────────────────────────
async function run(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  function pass(name: string, detail?: string) {
    results.push({ name, passed: true, detail })
  }
  function fail(name: string, detail: string) {
    results.push({ name, passed: false, detail })
  }
  function check(name: string, condition: boolean, detail: string) {
    condition ? pass(name, detail) : fail(name, detail)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 1: PIN LOGIN
  // ════════════════════════════════════════════════════════════════════════════

  // 1a. Correct PIN → success + cookie
  {
    const r = await apiCall('/api/pin-login', {
      method: 'POST',
      body: { profileId: GREY_PROFILE_ID, pin: '1234' },
    })
    check('PIN login: correct PIN returns 200', r.status === 200, `status=${r.status}, body=${JSON.stringify(r.body)}`)
    check('PIN login: returns role=child', r.body?.role === 'child', `role=${r.body?.role}`)
  }

  // 1b. Wrong PIN → 401
  {
    const r = await apiCall('/api/pin-login', {
      method: 'POST',
      body: { profileId: GREY_PROFILE_ID, pin: '0000' },
    })
    check('PIN login: wrong PIN returns 401', r.status === 401, `status=${r.status}`)
  }

  // 1c. Non-4-digit PIN → 400
  {
    const r = await apiCall('/api/pin-login', {
      method: 'POST',
      body: { profileId: GREY_PROFILE_ID, pin: '12' },
    })
    check('PIN login: short PIN returns 400', r.status === 400, `status=${r.status}`)
  }

  // 1d. Non-numeric PIN → 400
  {
    const r = await apiCall('/api/pin-login', {
      method: 'POST',
      body: { profileId: GREY_PROFILE_ID, pin: 'abcd' },
    })
    check('PIN login: non-numeric PIN returns 400', r.status === 400, `status=${r.status}`)
  }

  // 1e. Profile with no PIN → 401
  {
    const r = await apiCall('/api/pin-login', {
      method: 'POST',
      body: { profileId: DAD_PROFILE_ID, pin: '1234' },
    })
    check('PIN login: no PIN set returns 401', r.status === 401, `status=${r.status}`)
  }

  // 1f. Brute force — trigger lockout after 5 bad attempts
  {
    // Clean any previous attempts first
    await supabase.from('pin_attempts').delete().eq('profile_id', SMITH_KID_ID)

    for (let i = 0; i < 5; i++) {
      await apiCall('/api/pin-login', { method: 'POST', body: { profileId: SMITH_KID_ID, pin: '0000' } })
    }
    const r = await apiCall('/api/pin-login', { method: 'POST', body: { profileId: SMITH_KID_ID, pin: '9999' } })
    check('PIN login: lockout after 5 failures returns 429', r.status === 429, `status=${r.status}, body=${JSON.stringify(r.body)}`)

    // Clean up attempts so test family can still log in
    await supabase.from('pin_attempts').delete().eq('profile_id', SMITH_KID_ID)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 2: FAMILY MEMBERS ENDPOINT
  // ════════════════════════════════════════════════════════════════════════════

  // 2a. Authenticated user sees only their family
  {
    const r = await apiCall('/api/family-members', { profileToken: GREY_TOKEN })
    const ids = (r.body || []).map((m: any) => m.id)
    check('Family members: Carlson child sees only Carlsons', 
      ids.includes(GREY_PROFILE_ID) && !ids.includes(SMITH_KID_ID),
      `ids=${JSON.stringify(ids)}`)
  }

  // 2b. pin_hash never exposed
  {
    const r = await apiCall('/api/family-members', { profileToken: GREY_TOKEN })
    const hasPinHash = (r.body || []).some((m: any) => 'pin_hash' in m)
    check('Family members: pin_hash never returned', !hasPinHash, `hasPinHash=${hasPinHash}`)
  }

  // 2c. access_token never exposed
  {
    const r = await apiCall('/api/family-members', { profileToken: GREY_TOKEN })
    const hasToken = (r.body || []).some((m: any) => 'access_token' in m)
    check('Family members: access_token never returned', !hasToken, `hasToken=${hasToken}`)
  }

  // 2d. Unauthenticated with single-family DB → still works (single-tenant mode)
  {
    const r = await apiCall('/api/family-members')
    // With 2 families in DB now (Carlsons + test Smiths), this should return 404 (multi-family, no session)
    check('Family members: no session + multi-family returns 404', r.status === 404, `status=${r.status}`)
  }

  // 2e. Smith family member can only see Smith family
  {
    const r = await apiCall('/api/family-members', { profileToken: SMITH_KID_TOKEN })
    const ids = (r.body || []).map((m: any) => m.id)
    check('Family members: Smith kid sees only Smiths',
      ids.includes(SMITH_KID_ID) && !ids.includes(GREY_PROFILE_ID),
      `ids=${JSON.stringify(ids)}`)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 3: TASKS ENDPOINT — DATA ISOLATION
  // ════════════════════════════════════════════════════════════════════════════

  // 3a. Grey sees his own tasks
  {
    const r = await apiCall(`/api/tasks?date=${new Date().toISOString().split('T')[0]}`, { profileToken: GREY_TOKEN })
    check('Tasks: Grey gets 200', r.status === 200, `status=${r.status}`)
    check('Tasks: Grey sees tasks', Array.isArray(r.body) && r.body.length > 0, `count=${r.body?.length}`)
  }

  // 3b. Grey cannot see Smith kid's tasks (cross-family)
  {
    const r = await apiCall(`/api/tasks?date=${new Date().toISOString().split('T')[0]}`, { profileToken: GREY_TOKEN })
    const taskIds = (r.body || []).map((t: any) => t.id)
    check("Tasks: Grey can't see Smith family's tasks",
      !taskIds.includes(SMITH_KID_TASK_ID),
      `taskIds contains Smith task: ${taskIds.includes(SMITH_KID_TASK_ID)}`)
  }

  // 3c. Smith kid sees only their task
  {
    const r = await apiCall(`/api/tasks?date=${new Date().toISOString().split('T')[0]}`, { profileToken: SMITH_KID_TOKEN })
    const taskIds = (r.body || []).map((t: any) => t.id)
    check('Tasks: Smith kid sees their own task',
      taskIds.includes(SMITH_KID_TASK_ID),
      `taskIds=${JSON.stringify(taskIds)}`)
    check("Tasks: Smith kid can't see Carlson tasks",
      !taskIds.some((id: string) => [
        '5a59715a-ef77-4375-8c45-380cbcb8e7d8', // Grey's task ids from today
      ].includes(id)),
      'no cross-family tasks')
  }

  // 3d. Unauthenticated → 401
  {
    const r = await apiCall('/api/tasks')
    check('Tasks: unauthenticated returns 401', r.status === 401, `status=${r.status}`)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 4: SWITCH-PROFILE (parent impersonation)
  // ════════════════════════════════════════════════════════════════════════════

  // 4a. Parent can switch to their own child
  {
    const r = await apiCall('/api/switch-profile', {
      method: 'POST',
      profileToken: DAD_TOKEN,
      body: { profileId: GREY_PROFILE_ID },
    })
    check('Switch profile: parent can switch to own child', r.status === 200, `status=${r.status}`)
  }

  // 4b. Parent CANNOT switch to a child from another family
  {
    const r = await apiCall('/api/switch-profile', {
      method: 'POST',
      profileToken: DAD_TOKEN,
      body: { profileId: SMITH_KID_ID },
    })
    check('Switch profile: parent cannot impersonate other family child', 
      r.status === 404 || r.status === 403,
      `status=${r.status}`)
  }

  // 4c. Child cannot switch profiles at all
  {
    const r = await apiCall('/api/switch-profile', {
      method: 'POST',
      profileToken: GREY_TOKEN,
      body: { profileId: SMITH_KID_ID },
    })
    check('Switch profile: child cannot impersonate anyone', 
      r.status === 403 || r.status === 401,
      `status=${r.status}`)
  }

  // 4d. Unauthenticated cannot switch
  {
    const r = await apiCall('/api/switch-profile', {
      method: 'POST',
      body: { profileId: GREY_PROFILE_ID },
    })
    check('Switch profile: unauthenticated returns 401', r.status === 401, `status=${r.status}`)
  }

  // 4e. active_profile_id cookie is family-scoped — Dad with active_profile_id of Smith kid should not see Smith tasks
  {
    const r = await apiCall(`/api/tasks?date=${new Date().toISOString().split('T')[0]}`, {
      profileToken: DAD_TOKEN,
      activeProfileId: SMITH_KID_ID, // forged cookie — Smith kid, but Dad is Carlson
    })
    const taskIds = (r.body || []).map((t: any) => t.id)
    check('Tasks: forged active_profile_id from other family is rejected',
      !taskIds.includes(SMITH_KID_TASK_ID),
      `taskIds=${JSON.stringify(taskIds)}`)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 5: SET-PIN (only parents, only same family)
  // ════════════════════════════════════════════════════════════════════════════

  // 5a. Parent can set PIN for their own child
  {
    const r = await apiCall('/api/set-pin', {
      method: 'POST',
      profileToken: DAD_TOKEN,
      body: { profileId: GREY_PROFILE_ID, pin: '1234' },
    })
    check('Set PIN: parent can set PIN for own child', r.status === 200, `status=${r.status}`)
  }

  // 5b. Parent CANNOT set PIN for child in another family
  {
    const r = await apiCall('/api/set-pin', {
      method: 'POST',
      profileToken: DAD_TOKEN,
      body: { profileId: SMITH_KID_ID, pin: '0000' },
    })
    check('Set PIN: parent cannot set PIN for other family child',
      r.status === 404 || r.status === 403,
      `status=${r.status}`)
  }

  // 5c. Child cannot set anyone's PIN
  {
    const r = await apiCall('/api/set-pin', {
      method: 'POST',
      profileToken: GREY_TOKEN,
      body: { profileId: GREY_PROFILE_ID, pin: '5678' },
    })
    check('Set PIN: child cannot set PINs', r.status === 403, `status=${r.status}`)
  }

  // 5d. Unauthenticated cannot set PIN
  {
    const r = await apiCall('/api/set-pin', {
      method: 'POST',
      body: { profileId: GREY_PROFILE_ID, pin: '1234' },
    })
    check('Set PIN: unauthenticated returns 401', r.status === 401, `status=${r.status}`)
  }

  // 5e. Non-4-digit PIN rejected
  {
    const r = await apiCall('/api/set-pin', {
      method: 'POST',
      profileToken: DAD_TOKEN,
      body: { profileId: GREY_PROFILE_ID, pin: '12345' },
    })
    check('Set PIN: 5-digit PIN rejected', r.status === 400, `status=${r.status}`)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 6: ACTIVE PROFILE ENDPOINT
  // ════════════════════════════════════════════════════════════════════════════

  // 6a. pin_hash never returned
  {
    const r = await apiCall('/api/active-profile', { profileToken: GREY_TOKEN })
    check('Active profile: pin_hash never returned', !('pin_hash' in (r.body || {})), `keys=${Object.keys(r.body || {})}`)
  }

  // 6b. Returns correct profile for token
  {
    const r = await apiCall('/api/active-profile', { profileToken: GREY_TOKEN })
    check('Active profile: returns correct profile',
      r.body?.id === GREY_PROFILE_ID && r.body?.name === 'Grey',
      `id=${r.body?.id}, name=${r.body?.name}`)
  }

  // 6c. Unauthenticated → 401
  {
    const r = await apiCall('/api/active-profile')
    check('Active profile: unauthenticated returns 401', r.status === 401, `status=${r.status}`)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 7: GENERATE TASKS (parent only)
  // ════════════════════════════════════════════════════════════════════════════

  // 7a. Child cannot trigger task generation
  {
    const r = await apiCall('/api/generate-task-instances', {
      method: 'POST',
      profileToken: GREY_TOKEN,
    })
    check('Generate tasks: child cannot trigger', r.status === 403, `status=${r.status}`)
  }

  // 7b. Unauthenticated cannot trigger
  {
    const r = await apiCall('/api/generate-task-instances', { method: 'POST' })
    check('Generate tasks: unauthenticated returns 401', r.status === 401, `status=${r.status}`)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 8: DATABASE — RLS VERIFICATION
  // ════════════════════════════════════════════════════════════════════════════

  // 8a. anon client cannot read any profiles
  {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await anonClient.from('profiles').select('id, name')
    check('RLS: anon client cannot read profiles',
      !data?.length,
      `rows=${data?.length}, error=${error?.message}`)
  }

  // 8b. anon client cannot read task_instances
  {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await anonClient.from('task_instances').select('id')
    check('RLS: anon client cannot read task_instances',
      !data?.length,
      `rows=${data?.length}`)
  }

  // 8c. anon client cannot read families
  {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await anonClient.from('families').select('id, name')
    check('RLS: anon client cannot read families',
      !data?.length,
      `rows=${data?.length}`)
  }

  // 8d. pin_attempts table is service-role only
  {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await anonClient.from('pin_attempts').select('id')
    check('RLS: anon client cannot read pin_attempts',
      !data?.length,
      `rows=${data?.length}`)
  }

  return results
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const secret = process.env.TEST_SUITE_SECRET || 'chorezap-dev-test-2026'
  const provided = req.nextUrl.searchParams.get('secret')

  if (provided !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await run()

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length

  return NextResponse.json({
    summary: { total, passed, failed, allPassed: failed === 0 },
    results,
  }, {
    status: failed === 0 ? 200 : 207,
  })
}

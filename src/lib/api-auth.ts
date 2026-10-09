import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { adminClient, getSessionProfile, type SessionProfile } from './session'

type Admin = ReturnType<typeof adminClient>
type Ok = { me: SessionProfile; admin: Admin; error?: undefined }
type Err = { error: NextResponse; me?: undefined; admin?: undefined }

/** Every parent API call goes through here: logged in, parent, family-scoped. */
export async function requireParent(): Promise<Ok | Err> {
  const me = await getSessionProfile()
  if (!me) return { error: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) }
  if (me.role !== 'parent') return { error: NextResponse.json({ error: 'Parents only.' }, { status: 403 }) }
  return { me, admin: adminClient() }
}

/**
 * The child screen, either as the child or as a parent using "view as child"
 * (active_profile_id cookie pointing at a child in the same family).
 */
export async function requireChild(): Promise<Ok | Err> {
  const me = await getSessionProfile()
  if (!me) return { error: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) }
  const admin = adminClient()
  if (me.role === 'child') return { me, admin }

  const activeId = (await cookies()).get('active_profile_id')?.value
  if (activeId && (await childInFamily(admin, me.family_id, activeId))) {
    return { me: { id: activeId, role: 'child', family_id: me.family_id }, admin }
  }
  return { error: NextResponse.json({ error: 'This screen is for kids.' }, { status: 403 }) }
}

/** Is this profile id a child in my family? */
export async function childInFamily(admin: Admin, familyId: string, childId: string) {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('id', childId)
    .eq('family_id', familyId)
    .eq('role', 'child')
    .maybeSingle()
  return !!data
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

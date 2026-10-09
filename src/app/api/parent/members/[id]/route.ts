import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Where a parent's evening summary goes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const raw = typeof body.email === 'string' ? body.email.trim() : ''
  const email = raw === '' ? null : raw
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return bad('That email does not look right.')

  const { data, error } = await admin
    .from('profiles')
    .update({ email })
    .eq('id', id)
    .eq('family_id', me.family_id)
    .eq('role', 'parent')
    .select('id')
  if (error) return bad(error.message, 500)
  if (!data?.length) return bad('Parent not found.', 404)
  return NextResponse.json({ ok: true })
}

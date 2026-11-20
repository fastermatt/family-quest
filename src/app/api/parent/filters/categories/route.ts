import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { isCategoryId } from '@/lib/companion/categories'

export const dynamic = 'force-dynamic'

// Turn one category switch on or off.
export async function PUT(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  if (!isCategoryId(body.id)) return bad('Unknown category.')
  if (typeof body.enabled !== 'boolean') return bad('Say on or off.')

  const { error } = await admin.from('companion_categories').upsert(
    { family_id: me.family_id, category_id: body.id, enabled: body.enabled, updated_at: new Date().toISOString() },
    { onConflict: 'family_id,category_id' }
  )
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}

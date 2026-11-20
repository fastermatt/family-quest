import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Unlink a PC: its token stops working at once.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { id } = await params
  const { data, error } = await admin
    .from('companion_devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('family_id', me.family_id)
    .is('revoked_at', null)
    .select('id')
  if (error) return bad(error.message, 500)
  if (!data?.length) return bad('PC not found.', 404)
  return NextResponse.json({ ok: true })
}

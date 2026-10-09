import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Rewards (privileges) stay locked until the day's required chores are shown.
export async function GET() {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const { data } = await admin
    .from('privileges')
    .select('id, name, description, gating_mode, visible_to')
    .eq('family_id', me.family_id)
    .order('created_at')
  return NextResponse.json({ rewards: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  if (!name) return bad('Name the reward.')

  const { error } = await admin.from('privileges').insert({
    family_id: me.family_id,
    name,
    description: '',
    gating_mode: 'all_tasks',
    required_template_ids: [],
    visible_to: [], // empty = every child
    created_by: me.id,
  })
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}

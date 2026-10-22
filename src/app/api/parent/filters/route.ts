import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { CATEGORIES } from '@/lib/companion/categories'
import { cleanRule } from '@/lib/companion/rules'
import { SYSTEM_ALLOW } from '@/lib/companion/policy'

export const dynamic = 'force-dynamic'

// Parent filter settings: rules plus category switches. Family-wide in v0.1.
export async function GET() {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth

  const [rules, cats] = await Promise.all([
    admin
      .from('companion_rules')
      .select('id, kind, domain, note, created_at')
      .eq('family_id', me.family_id)
      .order('created_at', { ascending: false }),
    admin.from('companion_categories').select('category_id, enabled').eq('family_id', me.family_id),
  ])
  if (rules.error) return bad(rules.error.message, 500)
  if (cats.error) return bad(cats.error.message, 500)

  const saved = new Map((cats.data ?? []).map((c) => [c.category_id as string, c.enabled as boolean]))
  const categories = CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    group: c.group,
    enabled: saved.has(c.id) ? saved.get(c.id)! : c.defaultOn,
  }))
  return NextResponse.json({ rules: rules.data ?? [], categories, alwaysAllowed: SYSTEM_ALLOW })
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const body = await req.json().catch(() => ({}))
  const r = cleanRule(body)
  if (r.error) return bad(r.error)

  const { error } = await admin.from('companion_rules').upsert(
    { family_id: me.family_id, ...r.values, created_by: me.id },
    { onConflict: 'family_id,kind,domain' }
  )
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}

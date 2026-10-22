import { NextRequest, NextResponse } from 'next/server'
import { bad, requireParent } from '@/lib/api-auth'
import { aggregateUsage, type UsageDomain } from '@/lib/companion/usage'
import { decide, type Rule } from '@/lib/companion/policy'
import { CATEGORIES, type CategoryId } from '@/lib/companion/categories'

export const dynamic = 'force-dynamic'

// "Seen this week": busiest sites across the family's PCs, with what the rules say about each.
export async function GET(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth
  const days = Math.min(14, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 7))
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  const [usage, rules, cats] = await Promise.all([
    admin
      .from('companion_usage')
      .select('domains, period_end')
      .eq('family_id', me.family_id)
      .gt('period_end', since)
      .order('period_end', { ascending: false })
      .limit(400),
    admin.from('companion_rules').select('kind, domain').eq('family_id', me.family_id),
    admin.from('companion_categories').select('category_id, enabled').eq('family_id', me.family_id),
  ])
  if (usage.error) return bad(usage.error.message, 500)

  const saved = new Map((cats.data ?? []).map((c) => [c.category_id as string, c.enabled as boolean]))
  const enabledCategories = CATEGORIES.filter((c) => (saved.has(c.id) ? saved.get(c.id) : c.defaultOn)).map((c) => c.id as CategoryId)
  const policy = { rules: (rules.data ?? []) as Rule[], enabledCategories }

  const rows = (usage.data ?? []) as Array<{ domains: UsageDomain[]; period_end: string }>
  const sites = aggregateUsage(rows)
    .slice(0, 60)
    .map((s) => {
      const d = decide(s.site, policy)
      return { ...s, status: d.action === 'block' ? 'blocked' : d.reason === 'default' ? 'open' : d.reason }
    })
  return NextResponse.json({ days, uploads: rows.length, lastUpload: rows[0]?.period_end ?? null, sites })
}

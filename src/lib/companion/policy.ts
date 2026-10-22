// The decision: may this device open this domain right now?
// Pure and deterministic so the Windows service can port it and the same tests apply.
//
// Order (from the architecture review):
//   1. System allowlist  - things that must always work. Not editable.
//   2. Rules, most specific domain wins. Same domain: school > deny > allow.
//   3. Category switches that are on.
//   4. Default allow (the service logs unknown activity, it does not guess).

import { CATEGORIES, type CategoryId } from './categories.ts'
import { domainMatches, suffixes, type RuleKind } from './domains.ts'

/** Always reachable, whatever a parent or category says. Per-family school sites are 'school' rules. */
export const SYSTEM_ALLOW: string[] = [
  'family-tasks-deploy.vercel.app', // ChoreZap itself: a lock must never trap Grey away from his chores
  'windowsupdate.com',
  'update.microsoft.com',
  'delivery.mp.microsoft.com',
  'digicert.com', // certificate revocation checks
  'ocsp.pki.goog',
  'letsencrypt.org',
]

export type Rule = { kind: RuleKind; domain: string }

export type Policy = {
  rules: Rule[]
  enabledCategories: CategoryId[]
  /** Domains for 'external' categories, loaded and cached server-side. Missing = category has no effect yet. */
  listDomains?: Partial<Record<CategoryId, ReadonlySet<string>>>
}

export type Decision = {
  action: 'allow' | 'block'
  reason: 'system' | 'school' | 'allow' | 'deny' | 'category' | 'default'
  /** The rule domain or category id that decided it. */
  match?: string
}

const KIND_RANK: Record<RuleKind, number> = { school: 3, deny: 2, allow: 1 }

export function decide(domain: string, policy: Policy): Decision {
  for (const s of SYSTEM_ALLOW) {
    if (domainMatches(s, domain)) return { action: 'allow', reason: 'system', match: s }
  }

  let best: Rule | null = null
  for (const r of policy.rules) {
    if (!domainMatches(r.domain, domain)) continue
    if (
      !best ||
      r.domain.length > best.domain.length ||
      (r.domain.length === best.domain.length && KIND_RANK[r.kind] > KIND_RANK[best.kind])
    ) {
      best = r
    }
  }
  if (best) {
    return best.kind === 'deny'
      ? { action: 'block', reason: 'deny', match: best.domain }
      : { action: 'allow', reason: best.kind, match: best.domain }
  }

  const enabled = new Set(policy.enabledCategories)
  for (const c of CATEGORIES) {
    if (!enabled.has(c.id)) continue
    if (c.source === 'curated') {
      if (c.domains?.some((d) => domainMatches(d, domain))) return { action: 'block', reason: 'category', match: c.id }
    } else {
      const set = policy.listDomains?.[c.id]
      if (set && suffixes(domain).some((s) => set.has(s))) return { action: 'block', reason: 'category', match: c.id }
    }
  }

  return { action: 'allow', reason: 'default' }
}

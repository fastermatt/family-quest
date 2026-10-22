import { RULE_KINDS, normalizeDomain, type RuleKind } from './domains.ts'
import { SYSTEM_ALLOW } from './policy.ts'
import { domainMatches } from './domains.ts'

export type CleanRule = { kind: RuleKind; domain: string; note: string }

/** Validate a rule a parent is adding. Friendly messages, safe to show as-is. */
export function cleanRule(body: unknown): { error: string; values?: undefined } | { error?: undefined; values: CleanRule } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const kind = b.kind
  if (typeof kind !== 'string' || !(RULE_KINDS as string[]).includes(kind)) return { error: 'Pick allow, block or school.' }
  const domain = normalizeDomain(b.domain)
  if (!domain) return { error: 'That does not look like a website. Try something like example.com.' }
  if (kind === 'deny' && SYSTEM_ALLOW.some((s) => domainMatches(s, domain) || domainMatches(domain, s))) {
    return { error: 'That site is always allowed so ChoreZap and Windows keep working.' }
  }
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 120) : ''
  return { values: { kind: kind as RuleKind, domain, note } }
}

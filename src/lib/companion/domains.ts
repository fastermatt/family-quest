// Domain helpers for the Windows companion filters. Pure functions, no I/O.

export type RuleKind = 'school' | 'allow' | 'deny'
export const RULE_KINDS: RuleKind[] = ['school', 'allow', 'deny']

/**
 * Turn whatever a parent pasted ("https://www.TikTok.com/foo?x=1", "tiktok.com")
 * into a bare lowercase domain. Returns null if it is not a usable domain.
 * A leading "www." is dropped because a rule for a site covers its subdomains.
 * IP addresses and single-label names ("com", "localhost") are rejected.
 */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let s = input.trim().toLowerCase()
  if (!s || s.length > 300) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s
  let host: string
  try {
    host = new URL(s).hostname // also converts unicode to punycode
  } catch {
    return null
  }
  host = host.replace(/\.$/, '').replace(/^www\./, '')
  if (!host || host.length > 253) return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return null
  const labels = host.split('.')
  if (labels.length < 2) return null
  for (const l of labels) {
    if (!l || l.length > 63 || !/^[a-z0-9-]+$/.test(l) || l.startsWith('-') || l.endsWith('-')) return null
  }
  return host
}

/** "a.b.example.com" -> ["a.b.example.com", "b.example.com", "example.com"] (never the bare TLD). */
export function suffixes(domain: string): string[] {
  const labels = domain.split('.')
  const out: string[] = []
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join('.'))
  return out
}

/** Does `rule` cover `domain`? A rule covers the domain itself and every subdomain. */
export function domainMatches(rule: string, domain: string): boolean {
  return domain === rule || domain.endsWith('.' + rule)
}

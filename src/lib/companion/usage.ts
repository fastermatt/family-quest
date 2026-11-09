import { domainMatches, normalizeDomain } from './domains.ts'

// "Seen this week": the PC samples its DNS cache, rolls the sightings up on the PC,
// and uploads one small summary about once an hour. Counts are how many checks a
// site showed up in, not exact visits.

export const MAX_DOMAINS_PER_UPLOAD = 200
export const MAX_COUNT = 100_000
export const MIN_UPLOAD_GAP_MS = 5 * 60 * 1000
export const MAX_SPAN_MS = 26 * 3600 * 1000
export const RETENTION_DAYS = 14
export const MAX_UPLOAD_BYTES = 16 * 1024

export type UsageDomain = { d: string; n: number }
export type CleanUsage = {
  periodStart: string
  periodEnd: string
  domains: UsageDomain[]
  other: number
  total: number
}

export function cleanUsage(body: unknown, now = new Date()): { error: string; values?: undefined } | { error?: undefined; values: CleanUsage } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const start = typeof b.periodStart === 'string' ? new Date(b.periodStart) : null
  const end = typeof b.periodEnd === 'string' ? new Date(b.periodEnd) : null
  if (!start || !end || isNaN(+start) || isNaN(+end)) return { error: 'Bad time range.' }
  if (+end < +start || +end - +start > MAX_SPAN_MS) return { error: 'Bad time range.' }
  if (+end > +now + 5 * 60 * 1000) return { error: 'Bad time range.' }
  if (+start < +now - (RETENTION_DAYS + 1) * 86400_000) return { error: 'Too old.' }

  const merged = new Map<string, number>()
  let extra = 0
  for (const item of Array.isArray(b.domains) ? b.domains.slice(0, 2000) : []) {
    const it = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const d = normalizeDomain(it.d)
    const whole = typeof it.n === 'number' && Number.isFinite(it.n) ? Math.floor(it.n) : 0
    const n = whole < 1 ? 0 : Math.min(MAX_COUNT, whole)
    if (!d || !n) continue
    merged.set(d, Math.min(MAX_COUNT, (merged.get(d) ?? 0) + n))
  }
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const domains = sorted.slice(0, MAX_DOMAINS_PER_UPLOAD).map(([d, n]) => ({ d, n }))
  for (const [, n] of sorted.slice(MAX_DOMAINS_PER_UPLOAD)) extra += n
  const claimedOther = typeof b.other === 'number' && Number.isFinite(b.other) ? Math.min(MAX_COUNT * 10, Math.max(0, Math.floor(b.other))) : 0
  const other = claimedOther + extra
  const total = domains.reduce((s, x) => s + x.n, 0) + other
  return { values: { periodStart: start.toISOString(), periodEnd: end.toISOString(), domains, other, total } }
}

// ---- reading it back ----

const TWO_LEVEL = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'com.br', 'com.mx', 'co.in', 'co.za'])

/** "cdn.example.co.uk" -> "example.co.uk". A small rule, not the full public-suffix list. */
export function siteOf(domain: string): string {
  const l = domain.split('.')
  if (l.length >= 3 && TWO_LEVEL.has(l.slice(-2).join('.'))) return l.slice(-3).join('.')
  return l.slice(-2).join('.')
}

// Windows and certificate plumbing that would drown out real activity.
const NOISE = [
  'msftconnecttest.com',
  'data.microsoft.com',
  'windowsupdate.com',
  'update.microsoft.com',
  'delivery.mp.microsoft.com',
  'digicert.com',
  'ocsp.pki.goog',
  'letsencrypt.org',
  'msedge.net',
  'trafficmanager.net',
]
export function isNoise(domain: string): boolean {
  return NOISE.some((n) => domainMatches(n, domain))
}

export type Site = { site: string; n: number; examples: string[] }

/** Add up DNS sightings by exact hostname; counts are not visits or minutes. Noise is left out. */
export function aggregateUsage(rollups: Array<{ domains: UsageDomain[] }>, opts: { includeNoise?: boolean } = {}): Site[] {
  const sites = new Map<string, { n: number; subs: Map<string, number> }>()
  for (const r of rollups) {
    for (const { d, n } of r.domains ?? []) {
      if (!opts.includeNoise && isNoise(d)) continue
      // Keep the observed hostname. Guessing registrable domains can merge
      // unrelated tenants (e.g. two github.io sites) and widen a quick rule.
      const s = d
      const e = sites.get(s) ?? { n: 0, subs: new Map() }
      e.n += n
      e.subs.set(d, (e.subs.get(d) ?? 0) + n)
      sites.set(s, e)
    }
  }
  return [...sites.entries()]
    .map(([site, e]) => ({
      site,
      n: e.n,
      examples: [...e.subs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d),
    }))
    .sort((a, b) => b.n - a.n || a.site.localeCompare(b.site))
}

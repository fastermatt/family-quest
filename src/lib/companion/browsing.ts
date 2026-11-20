import { denverDay } from './activity.ts'

export const MAX_BROWSE_BODY_BYTES = 512 * 1024
export const MAX_BROWSE_VISITS = 2000

const categories = new Set(['youtube', 'gaming', 'social', 'school', 'other'])
const sensitivePath = /(token|password|passwd|secret|session|reset|auth|credential|private.?key)/i
const videoId = /^[A-Za-z0-9_-]{11}$/
const titleURL = /https?:\/\/[^\s"'<>]+/gi
const keysOnly = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))

function safeURL(raw: string, expectedDomain: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.hash) return null
  if (u.port && u.port !== '80' && u.port !== '443') return null
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  const domain = host.replace(/^www\./, '')
  if (domain !== expectedDomain || !domain || !domain.includes('.') || /(^|\.)(localhost|local|internal|home|lan|corp|test|invalid|example)$/.test(domain)) return null
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(domain) || /^172\.(1[6-9]|2\d|3[01])\./.test(domain) || domain === '::1' || domain.startsWith('[fe80:') || domain.startsWith('[fc') || domain.startsWith('[fd')) return null
  let path = u.pathname || '/'
  if (sensitivePath.test(path) || path.length > 512) path = '/'
  if ((domain === 'youtube.com' || domain.endsWith('.youtube.com')) && path === '/watch') {
    const id = u.searchParams.get('v')
    const params = [...u.searchParams.keys()]
    if (id && videoId.test(id) && params.length === 1 && params[0] === 'v' && u.protocol === 'https:') {
      return `https://www.youtube.com/watch?v=${id}`
    }
  }
  const scheme = u.protocol
  return `${scheme}//${host}${path}`
}

function categoryFor(domain: string) {
  if (domain === 'youtube.com' || domain.endsWith('.youtube.com')) return 'youtube'
  if (domain === 'twitch.tv' || domain.endsWith('.twitch.tv') || domain === 'steampowered.com' || domain.endsWith('.steampowered.com') || domain === 'steamcommunity.com' || domain === 'roblox.com' || domain.endsWith('.roblox.com') || domain === 'discord.com' || domain.endsWith('.discord.com')) return 'gaming'
  if (['instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'snapchat.com', 'facebook.com'].includes(domain) || domain === 'reddit.com' || domain.endsWith('.reddit.com')) return 'social'
  if (domain === 'khanacademy.org' || domain.endsWith('.khanacademy.org') || ['classroom.google.com', 'docs.google.com', 'drive.google.com', 'schoology.com', 'powerschool.com', 'canvas.instructure.com'].includes(domain)) return 'school'
  return 'other'
}

function cleanTitle(raw: string) {
  const withoutControls = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  const scrubbed = withoutControls.replace(titleURL, value => {
    const trimmed = value.replace(/[.,;:!?\])}]+$/, '')
    const punctuation = value.slice(trimmed.length)
    let domain = ''
    try { domain = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') } catch { return `[link omitted]${punctuation}` }
    return `${safeURL(trimmed, domain) ?? '[link omitted]'}${punctuation}`
  })
  return [...scrubbed].slice(0, 120).join('')
}

function assertCoverage(raw: unknown, entries: Record<string, unknown>[]) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid browser coverage.')
  const c = raw as Record<string, unknown>
  if (!keysOnly(c, ['status', 'supportedBrowsers', 'profilesPerBrowser', 'visitLimit', 'browsers']) || !['complete', 'partial', 'unavailable'].includes(String(c.status)) || c.profilesPerBrowser !== 8 || c.visitLimit !== MAX_BROWSE_VISITS || !Array.isArray(c.supportedBrowsers) || c.supportedBrowsers.length !== 2 || c.supportedBrowsers[0] !== 'edge' || c.supportedBrowsers[1] !== 'chrome' || !Array.isArray(c.browsers) || c.browsers.length !== 2) throw new Error('Invalid browser coverage.')
  const browserRows = new Map<string, Record<string, unknown>>()
  for (const value of c.browsers) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid browser coverage.')
    const row = value as Record<string, unknown>
    if (!keysOnly(row, ['browser', 'installed', 'profilesDiscovered', 'profilesRead', 'profilesSkipped', 'visitsReported', 'truncated']) || !['edge', 'chrome'].includes(String(row.browser)) || browserRows.has(String(row.browser)) || typeof row.installed !== 'boolean' || typeof row.truncated !== 'boolean') throw new Error('Invalid browser coverage.')
    for (const key of ['profilesDiscovered', 'profilesRead', 'profilesSkipped', 'visitsReported']) if (!Number.isSafeInteger(row[key]) || Number(row[key]) < 0) throw new Error('Invalid browser coverage.')
    if (Number(row.profilesDiscovered) > 500 || Number(row.profilesRead) > 8 || Number(row.profilesSkipped) > 500 || Number(row.visitsReported) > MAX_BROWSE_VISITS) throw new Error('Invalid browser coverage.')
    if (Number(row.profilesRead) + Number(row.profilesSkipped) > Number(row.profilesDiscovered) && Number(row.profilesDiscovered) !== 0) throw new Error('Inconsistent browser coverage.')
    browserRows.set(String(row.browser), row)
  }
  if (!browserRows.has('edge') || !browserRows.has('chrome')) throw new Error('Invalid browser coverage.')
  const actualCounts = { edge: 0, chrome: 0 }
  for (const entry of entries) actualCounts[String(entry.browser) as 'edge' | 'chrome']++
  for (const browser of ['edge', 'chrome']) if (Number(browserRows.get(browser)!.visitsReported) !== actualCounts[browser as 'edge' | 'chrome']) throw new Error('Inconsistent browser coverage.')
  const installed = [...browserRows.values()].filter(row => row.installed)
  const expectedStatus = installed.length === 0 ? 'unavailable' : installed.some(row => Number(row.profilesSkipped) > 0 || row.truncated) ? 'partial' : 'complete'
  if (c.status !== expectedStatus || (expectedStatus === 'unavailable' && entries.length > 0)) throw new Error('Inconsistent browser coverage.')
  return c
}

function normalizeVisit(value: unknown, day: string, now: Date) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid browser visit.')
  const e = value as Record<string, unknown>
  if (!keysOnly(e, ['id', 'browser', 'profile', 'domain', 'category', 'title', 'url', 'visitedAt', 'durationSeconds']) || !/^[a-f0-9]{64}$/.test(String(e.id)) || !['edge', 'chrome'].includes(String(e.browser)) || !/^(Default|Profile [1-9][0-9]{0,3})$/.test(String(e.profile))) throw new Error('Invalid browser visit.')
  const domain = typeof e.domain === 'string' ? e.domain.toLowerCase() : ''
  if (!domain || domain.length > 253 || domain.startsWith('www.') || !/^[a-z0-9.-]+$/.test(domain) || e.category !== categoryFor(domain)) throw new Error('Invalid browser visit.')
  const safe = typeof e.url === 'string' && e.url.length <= 512 ? safeURL(e.url, domain) : null
  if (!safe || safe !== e.url) throw new Error('Invalid browser visit URL.')
  if (typeof e.visitedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(e.visitedAt)) throw new Error('Invalid browser visit time.')
  const visited = new Date(e.visitedAt)
  if (!Number.isFinite(visited.getTime()) || denverDay(visited) !== day || visited.getTime() > now.getTime() + 120_000) throw new Error('Browser visit is outside the reported day.')
  if (e.title !== undefined && (typeof e.title !== 'string' || e.title.length > 2048)) throw new Error('Invalid browser visit title.')
  if (e.durationSeconds !== null && (typeof e.durationSeconds !== 'number' || !Number.isFinite(e.durationSeconds) || e.durationSeconds <= 0 || e.durationSeconds > 1800)) throw new Error('Invalid browser visit duration.')
  return { id: e.id, browser: e.browser, profile: e.profile, domain, category: e.category, ...(e.title ? { title: cleanTitle(e.title) } : {}), url: safe, visitedAt: e.visitedAt, durationSeconds: e.durationSeconds }
}

function normalizeLegacy(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy browser entry.')
  const e = value as Record<string, unknown>
  if (!keysOnly(e, ['domain', 'category', 'title', 'seconds']) || typeof e.domain !== 'string' || !e.domain || e.domain.length > 253 || !/^[a-z0-9.-]+$/i.test(e.domain) || typeof e.seconds !== 'number' || !Number.isFinite(e.seconds) || e.seconds <= 0 || e.seconds > 86400) throw new Error('Invalid legacy browser entry.')
  const domain = e.domain.toLowerCase()
  const category = categories.has(String(e.category)) ? e.category : 'other'
  if (e.title !== undefined && (typeof e.title !== 'string' || e.title.length > 2048)) throw new Error('Invalid legacy browser title.')
  return { domain, category, ...(e.title ? { title: cleanTitle(e.title) } : {}), seconds: e.seconds }
}

export function normalizeBrowsePayload(raw: unknown, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid browser history upload.')
  const b = raw as Record<string, unknown>
  if (!keysOnly(b, ['day', 'entries', 'coverage']) || typeof b.day !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(b.day) || b.day !== denverDay(now) || !Array.isArray(b.entries)) throw new Error('Invalid browser history upload.')
  const hasVisits = b.coverage !== undefined || b.entries.some(value => value && typeof value === 'object' && 'visitedAt' in value)
  if (hasVisits) {
    if (b.entries.length > MAX_BROWSE_VISITS || b.coverage === undefined) throw new Error('Invalid browser history upload.')
    const entries = b.entries.map(value => normalizeVisit(value, b.day as string, now))
    const coverage = assertCoverage(b.coverage, entries)
    return { day: b.day, entries, coverage }
  }
  // Existing desktop builds send domain/title aggregates without timestamps.
  // Keep them readable as legacy aggregates; never invent visit times for them.
  if (b.entries.length > 5000 || (b.coverage !== undefined && b.coverage !== null)) throw new Error('Invalid browser history upload.')
  return { day: b.day, entries: b.entries.map(normalizeLegacy), coverage: null }
}

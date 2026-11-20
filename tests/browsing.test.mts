import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizeBrowsePayload } from '../src/lib/companion/browsing.ts'

const now = new Date('2026-11-11T18:00:00.000Z')
const coverage = (overrides: Record<string, unknown> = {}) => ({
  status: 'complete',
  supportedBrowsers: ['edge', 'chrome'],
  profilesPerBrowser: 8,
  visitLimit: 2000,
  browsers: [
    { browser: 'edge', installed: true, profilesDiscovered: 1, profilesRead: 1, profilesSkipped: 0, visitsReported: 1, truncated: false },
    { browser: 'chrome', installed: false, profilesDiscovered: 0, profilesRead: 0, profilesSkipped: 0, visitsReported: 0, truncated: false },
  ],
  ...overrides,
})
const visit = (overrides: Record<string, unknown> = {}) => ({
  id: 'a'.repeat(64), browser: 'edge', profile: 'Default', domain: 'youtube.com', category: 'youtube',
  title: 'A lesson', url: 'https://www.youtube.com/watch?v=abcdefghijk',
  visitedAt: '2026-11-11T17:59:00.123456Z', durationSeconds: null,
  ...overrides,
})

test('accepts UTC visit timeline and only preserves a canonical YouTube video ID', () => {
  const payload = normalizeBrowsePayload({ day: '2026-11-11', entries: [visit({ title: 'A lesson https://example.com/path?token=secret' })], coverage: coverage() }, now)
  const entry = payload.entries[0] as Record<string, unknown>
  assert.equal(entry.url, 'https://www.youtube.com/watch?v=abcdefghijk')
  assert.equal(entry.durationSeconds, null)
  assert.equal(entry.visitedAt, '2026-11-11T17:59:00.123456Z')
  assert.equal(entry.title, 'A lesson https://example.com/path')
  assert.equal((payload.coverage as Record<string, unknown>).status, 'complete')
})

test('accepts the actual Go serialized batch with canonicalized hosts, ports, paths, and subdomains', () => {
  const cwd = fileURLToPath(new URL('../companion-desktop/', import.meta.url))
  const output = execFileSync('go', ['test', '-run=^TestEmitBrowseContractFixture$', '-v'], { cwd, encoding: 'utf8' })
  const line = output.split('\n').find(value => value.startsWith('BROWSE_CONTRACT_JSON='))
  assert.ok(line, output)
  const batch = JSON.parse(line.slice('BROWSE_CONTRACT_JSON='.length))
  const payload = normalizeBrowsePayload(batch, now)
  const entries = payload.entries as Record<string, unknown>[]
  assert.equal(entries[0].url, 'https://www.example.com/Some%20Page')
  assert.equal(entries[0].category, 'other')
  assert.equal(entries[1].url, 'https://www.youtube.com/watch?v=abcdefghijk')
  assert.equal(entries[1].category, 'youtube')
  assert.equal(entries[2].url, 'https://m.reddit.com/r/example')
  assert.equal(entries[2].category, 'social')
})

test('rejects query strings, fragments, credentials, private hosts, and malformed visit data', () => {
  for (const url of [
    'https://example.com/find?q=private',
    'https://example.com/path#secret',
    'https://user:password@example.com/path',
    'http://192.168.1.1/admin',
    'http://localhost/private',
  ]) assert.throws(() => normalizeBrowsePayload({ day: '2026-11-11', entries: [visit({ domain: 'example.com', category: 'other', url })], coverage: coverage() }, now))
  assert.throws(() => normalizeBrowsePayload({ day: '2026-11-11', entries: [visit({ durationSeconds: 30_000 })], coverage: coverage() }, now))
  assert.throws(() => normalizeBrowsePayload({ day: '2026-11-11', entries: [visit({ visitedAt: '2026-11-10T23:59:00Z' })], coverage: coverage() }, now))
  assert.throws(() => normalizeBrowsePayload({ day: '2026-11-11', entries: [visit({ url: 'https://www.youtube.com/watch?v=abcdefghijk&list=private' })], coverage: coverage() }, now))
})

test('requires internally consistent coverage and rejects a stale Denver day', () => {
  assert.throws(() => normalizeBrowsePayload({ day: '2026-11-11', entries: [visit()], coverage: coverage({ status: 'partial' }) }, now))
  assert.throws(() => normalizeBrowsePayload({ day: '2026-11-10', entries: [visit()], coverage: coverage() }, now))
})

test('retains old aggregates without fabricating visit timestamps', () => {
  const payload = normalizeBrowsePayload({
    day: '2026-11-11', entries: [{ domain: 'youtube.com', category: 'youtube', title: 'Old client entry', seconds: 10 }],
  }, now)
  assert.equal(payload.coverage, null)
  const entry = payload.entries[0] as Record<string, unknown>
  assert.equal(entry.seconds, 10)
  assert.equal('visitedAt' in entry, false)
})


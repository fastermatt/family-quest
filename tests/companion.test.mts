import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDomain, domainMatches, suffixes } from '../src/lib/companion/domains.ts'
import { decide, SYSTEM_ALLOW, type Policy } from '../src/lib/companion/policy.ts'
import { CATEGORIES, CATEGORY_IDS, isCategoryId } from '../src/lib/companion/categories.ts'

test('normalizeDomain accepts what a parent might paste', () => {
  assert.equal(normalizeDomain('tiktok.com'), 'tiktok.com')
  assert.equal(normalizeDomain('  HTTPS://www.TikTok.com/foo?x=1#y  '), 'tiktok.com')
  assert.equal(normalizeDomain('http://m.youtube.com:8080/watch'), 'm.youtube.com')
  assert.equal(normalizeDomain('sub.example.co.uk.'), 'sub.example.co.uk')
  assert.equal(normalizeDomain('bücher.de'), 'xn--bcher-kva.de')
})

test('normalizeDomain rejects junk, IPs and bare TLDs', () => {
  for (const bad of ['', '   ', 'com', 'localhost', '192.168.1.5', 'http://10.0.0.2/x', '[::1]', 'a b.com', '-bad.com', 'bad-.com', 'x'.repeat(64) + '.com', null, 42, undefined]) {
    assert.equal(normalizeDomain(bad as unknown), null, String(bad))
  }
})

test('domainMatches covers subdomains but not look-alikes', () => {
  assert.equal(domainMatches('example.com', 'example.com'), true)
  assert.equal(domainMatches('example.com', 'a.b.example.com'), true)
  assert.equal(domainMatches('example.com', 'notexample.com'), false)
  assert.equal(domainMatches('example.com', 'example.com.evil.net'), false)
  assert.deepEqual(suffixes('a.b.example.com'), ['a.b.example.com', 'b.example.com', 'example.com'])
  assert.deepEqual(suffixes('example.com'), ['example.com'])
})

const base: Policy = { rules: [], enabledCategories: [] }

test('default is allow and logged as default', () => {
  assert.deepEqual(decide('anything.example.org', base), { action: 'allow', reason: 'default' })
})

test('system allowlist beats everything, including a parent deny and a category', () => {
  const p: Policy = {
    rules: [{ kind: 'deny', domain: 'family-tasks-deploy.vercel.app' }],
    enabledCategories: [],
  }
  const d = decide('family-tasks-deploy.vercel.app', p)
  assert.equal(d.action, 'allow')
  assert.equal(d.reason, 'system')
  assert.ok(SYSTEM_ALLOW.length > 0)
})

test('deny blocks the domain and its subdomains', () => {
  const p: Policy = { rules: [{ kind: 'deny', domain: 'games.example.com' }], enabledCategories: [] }
  assert.equal(decide('games.example.com', p).action, 'block')
  assert.equal(decide('cdn.games.example.com', p).action, 'block')
  assert.equal(decide('example.com', p).action, 'allow')
})

test('most specific rule wins: school page inside a denied site stays open', () => {
  const p: Policy = {
    rules: [
      { kind: 'deny', domain: 'google.com' },
      { kind: 'school', domain: 'classroom.google.com' },
    ],
    enabledCategories: [],
  }
  assert.deepEqual(decide('classroom.google.com', p), { action: 'allow', reason: 'school', match: 'classroom.google.com' })
  assert.equal(decide('www.google.com', p).action, 'block')
})

test('most specific rule wins: deny a sub-site of an allowed domain', () => {
  const p: Policy = {
    rules: [
      { kind: 'allow', domain: 'khanacademy.org' },
      { kind: 'deny', domain: 'ads.khanacademy.org' },
    ],
    enabledCategories: [],
  }
  assert.equal(decide('www.khanacademy.org', p).action, 'allow')
  assert.equal(decide('ads.khanacademy.org', p).action, 'block')
})

test('same domain tie: school > deny > allow', () => {
  const r = (kinds: Array<'school' | 'allow' | 'deny'>): Policy => ({
    rules: kinds.map((kind) => ({ kind, domain: 'x.com' })),
    enabledCategories: [],
  })
  assert.equal(decide('x.com', r(['allow', 'deny'])).reason, 'deny')
  assert.equal(decide('x.com', r(['deny', 'allow'])).reason, 'deny')
  assert.equal(decide('x.com', r(['deny', 'school'])).reason, 'school')
  assert.equal(decide('x.com', r(['allow', 'school', 'deny'])).reason, 'school')
})

test('a parent allow overrides a category block', () => {
  const p: Policy = {
    rules: [{ kind: 'allow', domain: 'discord.com' }],
    enabledCategories: ['discord'],
  }
  assert.equal(decide('discord.com', p).reason, 'allow')
  assert.equal(decide('cdn.discordapp.com', p).action, 'block') // other Discord domains still blocked
})

test('curated category blocks its domains only while switched on', () => {
  const on: Policy = { rules: [], enabledCategories: ['tiktok'] }
  assert.deepEqual(decide('www.tiktok.com', on), { action: 'block', reason: 'category', match: 'tiktok' })
  assert.equal(decide('tiktok.com.evil.net', on).action, 'allow')
  assert.equal(decide('www.tiktok.com', base).action, 'allow')
})

test('external list category uses the loaded set, and does nothing if not loaded', () => {
  const set = new Set(['badsite.net'])
  const loaded: Policy = { rules: [], enabledCategories: ['adult'], listDomains: { adult: set } }
  assert.deepEqual(decide('cdn.badsite.net', loaded), { action: 'block', reason: 'category', match: 'adult' })
  assert.equal(decide('goodsite.net', loaded).action, 'allow')
  const notLoaded: Policy = { rules: [], enabledCategories: ['adult'] }
  assert.equal(decide('cdn.badsite.net', notLoaded).action, 'allow')
})

test('a school rule beats an external list that contains the domain', () => {
  const p: Policy = {
    rules: [{ kind: 'school', domain: 'lessons.example.org' }],
    enabledCategories: ['social'],
    listDomains: { social: new Set(['example.org']) },
  }
  assert.equal(decide('lessons.example.org', p).reason, 'school')
})

test('category catalog is sane and never lists YouTube or game-platform domains', () => {
  assert.equal(new Set(CATEGORY_IDS).size, CATEGORIES.length)
  assert.equal(isCategoryId('tiktok'), true)
  assert.equal(isCategoryId('youtube'), false)
  assert.equal(isCategoryId(7), false)
  const never = ['youtube.com', 'googlevideo.com', 'steampowered.com', 'steamcommunity.com', 'xboxlive.com', 'microsoft.com']
  for (const c of CATEGORIES) {
    for (const d of c.domains ?? []) {
      assert.equal(normalizeDomain(d), d, `${c.id}: ${d} must be normalized`)
      assert.ok(!never.some((n) => domainMatches(n, d)), `${c.id}: ${d} must not be blocked`)
    }
    if (c.source === 'curated') assert.ok((c.domains ?? []).length > 0, c.id)
    if (c.source === 'external') assert.ok(c.externalList, c.id)
  }
})

import { cleanRule } from '../src/lib/companion/rules.ts'

test('cleanRule: normalizes, validates, protects always-allowed sites', () => {
  const ok = cleanRule({ kind: 'deny', domain: 'https://www.TikTok.com/', note: '  no  ' })
  assert.deepEqual(ok.values, { kind: 'deny', domain: 'tiktok.com', note: 'no' })
  assert.ok(cleanRule({ kind: 'nope', domain: 'a.com' }).error)
  assert.ok(cleanRule({ kind: 'deny', domain: 'localhost' }).error)
  assert.ok(cleanRule({ kind: 'deny', domain: '10.0.0.1' }).error)
  assert.ok(cleanRule({ kind: 'deny', domain: 'family-tasks-deploy.vercel.app' }).error)
  assert.ok(cleanRule({ kind: 'deny', domain: 'vercel.app' }).error) // would cover ChoreZap
  assert.equal(cleanRule({ kind: 'allow', domain: 'vercel.app' }).error, undefined)
  assert.ok(cleanRule(null).error)
})

import { cleanCode, cleanInventory, generateCode, newSecret, safeEqualHex, sha256 } from '../src/lib/companion/pairing.ts'

test('pairing codes are 6 digits and parents can type them loosely', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^\d{6}$/)
  assert.equal(cleanCode('123 456'), '123456')
  assert.equal(cleanCode(' 000-123 '), '000123')
  for (const bad of ['12345', '1234567', 'abcdef', '', null, 123456]) assert.equal(cleanCode(bad as unknown), null)
})

test('secrets are long, unique and compared safely', () => {
  const a = newSecret()
  assert.ok(a.length >= 40)
  assert.notEqual(a, newSecret())
  assert.equal(safeEqualHex(sha256(a), sha256(a)), true)
  assert.equal(safeEqualHex(sha256(a), sha256('x')), false)
  assert.equal(safeEqualHex('', ''), false)
  assert.equal(safeEqualHex('zz', 'zz'), false)
})

test('cleanInventory keeps known fields only and trims', () => {
  const inv = cleanInventory({
    agentVersion: '0.1.0',
    hostname: 'GREY-PC\n',
    windows: { edition: 'Core', displayVersion: '25H2', build: '26200', evil: 'x' },
    runningAs: 'matt',
    accounts: [{ name: 'Grey', type: 'local', isAdmin: false, enabled: true }, { name: 'matt', type: 'microsoft', isAdmin: true }, 'junk'],
    browsers: ['Edge', 'Chrome', '', 5],
    avast: true,
    secrets: 'ignored',
  })
  assert.deepEqual(inv, {
    agentVersion: '0.1.0',
    hostname: 'GREY-PC',
    windows: { edition: 'Core', displayVersion: '25H2', build: '26200' },
    runningAs: 'matt',
    accounts: [
      { name: 'Grey', type: 'local', isAdmin: false, enabled: true },
      { name: 'matt', type: 'microsoft', isAdmin: true, enabled: true },
      { name: '', type: 'unknown', isAdmin: false, enabled: true },
    ],
    browsers: ['Edge', 'Chrome'],
    avast: true,
    otherSecurity: [],
    status: { watching: false, samples: 0, lastSampleAt: '', lastUploadAt: '', lastError: '' },
  })
  const st = cleanInventory({ status: { watching: true, samples: 12.7, lastSampleAt: '2026-10-22T20:00:00Z', lastError: 'x'.repeat(500) } }).status
  assert.equal(st.watching, true)
  assert.equal(st.samples, 12)
  assert.equal(st.lastError.length, 160)
  assert.deepEqual(cleanInventory(null).accounts, [])
  assert.equal(cleanInventory({ accounts: [{ type: 'admin!' }] }).accounts[0].type, 'unknown')
  assert.equal(cleanInventory({ accounts: [{ isAdmin: 'yes' }] }).accounts[0].isAdmin, false)
  assert.equal(cleanInventory({ accounts: Array(30).fill({ name: 'x' }) }).accounts.length, 10)
})

import { aggregateUsage, cleanUsage, isNoise, siteOf, MAX_DOMAINS_PER_UPLOAD } from '../src/lib/companion/usage.ts'

const NOW = new Date('2026-10-22T20:00:00Z')
const good = { periodStart: '2026-10-22T19:00:00Z', periodEnd: '2026-10-22T20:00:00Z' }

test('cleanUsage normalizes, merges and drops junk domains', () => {
  const r = cleanUsage(
    { ...good, domains: [{ d: 'WWW.Example.com', n: 3 }, { d: 'example.com', n: 2 }, { d: '10.0.0.1', n: 9 }, { d: 'localhost', n: 4 }, { d: 'a.net', n: 0 }, { d: 'b.net', n: 1.9 }, 'x', null], other: 5 },
    NOW
  )
  assert.equal(r.error, undefined)
  assert.deepEqual(r.values!.domains, [{ d: 'example.com', n: 5 }, { d: 'b.net', n: 1 }])
  assert.equal(r.values!.other, 5)
  assert.equal(r.values!.total, 11)
})

test('cleanUsage keeps the top 200 and folds the rest into other', () => {
  const domains = Array.from({ length: 300 }, (_, i) => ({ d: `site${i}.com`, n: 300 - i }))
  const r = cleanUsage({ ...good, domains }, NOW)
  assert.equal(r.values!.domains.length, MAX_DOMAINS_PER_UPLOAD)
  assert.equal(r.values!.domains[0].d, 'site0.com')
  const folded = domains.slice(200).reduce((s, x) => s + x.n, 0)
  assert.equal(r.values!.other, folded)
  assert.equal(r.values!.total, domains.reduce((s, x) => s + x.n, 0))
})

test('cleanUsage rejects bad time ranges', () => {
  const t = (o: object) => cleanUsage({ domains: [], ...o }, NOW).error
  assert.ok(t({}))
  assert.ok(t({ periodStart: 'nope', periodEnd: 'nope' }))
  assert.ok(t({ periodStart: '2026-10-22T20:00:00Z', periodEnd: '2026-10-22T19:00:00Z' })) // backwards
  assert.ok(t({ periodStart: '2026-10-20T00:00:00Z', periodEnd: '2026-10-22T00:00:00Z' })) // longer than a day
  assert.ok(t({ periodStart: '2026-10-22T19:00:00Z', periodEnd: '2026-10-23T20:00:00Z' })) // future
  assert.ok(t({ periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-09-01T01:00:00Z' })) // too old
  assert.equal(t(good), undefined)
  assert.equal(cleanUsage(null, NOW).error, 'Bad time range.')
})

test('siteOf and noise', () => {
  assert.equal(siteOf('cdn.static.example.com'), 'example.com')
  assert.equal(siteOf('example.com'), 'example.com')
  assert.equal(siteOf('news.bbc.co.uk'), 'bbc.co.uk')
  assert.equal(isNoise('www.msftconnecttest.com'), true)
  assert.equal(isNoise('vortex.data.microsoft.com'), true)
  assert.equal(isNoise('example.com'), false)
})

test('aggregateUsage groups by site, hides noise, busiest first', () => {
  const sites = aggregateUsage([
    { domains: [{ d: 'a.tiktok.com', n: 5 }, { d: 'b.tiktok.com', n: 2 }, { d: 'khanacademy.org', n: 4 }, { d: 'x.msftconnecttest.com', n: 99 }] },
    { domains: [{ d: 'a.tiktok.com', n: 1 }, { d: 'ixl.com', n: 4 }] },
  ])
  assert.deepEqual(sites.map((s) => [s.site, s.n]), [['a.tiktok.com', 6], ['ixl.com', 4], ['khanacademy.org', 4], ['b.tiktok.com', 2]])
  assert.deepEqual(sites[0].examples, ['a.tiktok.com'])
  assert.equal(aggregateUsage([{ domains: [{ d: 'x.msftconnecttest.com', n: 1 }] }], { includeNoise: true }).length, 1)
  assert.deepEqual(aggregateUsage([]), [])
})


test('school exceptions cannot be overridden by a narrower deny', () => {
  const policy: Policy = { rules: [{ kind: 'school', domain: 'school.example.org' }, { kind: 'deny', domain: 'video.school.example.org' }], enabledCategories: [] }
  assert.equal(decide('video.school.example.org', policy).reason, 'school')
  assert.equal(decide('video.school.example.org.evil.net', policy).reason, 'default')
})

test('YouTube remains open even with explicit denies and loaded category lists', () => {
  for (const domain of ['youtube.com', 'www.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'r1.googlevideo.com', 'i.ytimg.com']) {
    const policy: Policy = { rules: [{ kind: 'deny', domain }], enabledCategories: ['adult'], listDomains: { adult: new Set([domain]) } }
    assert.equal(decide(domain, policy).reason, 'system', domain)
    assert.ok(cleanRule({ kind: 'deny', domain }).error)
  }
  assert.equal(decide('youtube.com.evil.net', base).reason, 'default')
})

test('network diagnostics never merge shared-hosting tenants', () => {
  const result = aggregateUsage([{ domains: [{ d: 'school.github.io', n: 2 }, { d: 'games.github.io', n: 3 }] }])
  assert.deepEqual(result.map((x) => x.site), ['games.github.io', 'school.github.io'])
})


test('page-level rules cannot silently become whole-site rules', () => {
  for (const domain of ['https://example.com/lesson', 'example.com?q=school', 'example.com#math', 'https://user:secret@example.com/', 'example.com:8080']) {
    assert.ok(cleanRule({ kind: 'school', domain }).error, domain)
  }
  assert.equal(cleanRule({ kind: 'school', domain: 'https://lessons.example.com/' }).error, undefined)
})

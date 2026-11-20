import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import pathModule from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const F = '10000000-0000-4000-8000-000000000001'
const C = '20000000-0000-4000-8000-000000000001'
const P = '30000000-0000-4000-8000-000000000001'
const P2 = '30000000-0000-4000-8000-000000000002'
const EVENT = '40000000-0000-4000-8000-000000000001'
const CLIENT = '50000000-0000-4000-8000-000000000001'
const TOKEN = 'a'.repeat(48)

type Handler = (request: unknown) => Promise<Response>
function load(path: string, mocks: Record<string, unknown>): Record<string, Handler> {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const unit = { exports: {} }
  vm.runInNewContext(code, {
    module: unit, exports: unit.exports,
    require: (name: string) => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks)
      if (name.startsWith('.')) return load(pathModule.join(pathModule.dirname(path), name) + (name.endsWith('.ts') ? '' : '.ts'), mocks)
      return require(name)
    },
    Response, Request, Headers, URL, Buffer, console,
  }, { filename: path })
  return unit.exports
}

function setup(options: {
  role?: 'parent' | 'child' | 'none'
  childInFamily?: boolean
  enabled?: boolean
  settingsError?: unknown
  events?: Record<string, unknown>[]
  eventError?: unknown
  authResult?: boolean
  rpcErrors?: Record<string, unknown>
  stopVerifyResult?: string
  stopPresenceError?: unknown
  updateError?: unknown
  pushDelayMs?: number
} = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const pushes: { ids: string[]; payload: Record<string, unknown> }[] = []
  const updates: { table: string; values: Record<string, unknown>; filters: Record<string, unknown> }[] = []
  let pushesInFlight = 0
  let maxPushConcurrency = 0
  const role = options.role ?? 'parent'
  const me = role === 'none' ? null : { id: role === 'child' ? C : P, family_id: F, role }
  const resultFor = (table: string, selected = '') => {
    if (table === 'companion_presence_settings') return { data: options.enabled === undefined ? null : { enabled: options.enabled }, error: options.settingsError ?? null }
    if (table === 'companion_presence_events') {
      const columns = selected.split(',').map(value => value.trim()).filter(Boolean)
      const data = options.events ?? []
      return { data: columns.length ? data.map(event => Object.fromEntries(columns.filter(key => key in event).map(key => [key, event[key]]))) : data, error: options.eventError ?? null }
    }
    return { data: null, error: null }
  }
  const admin = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args })
      const data = name === 'companion_presence_authorized' ? (options.authResult ?? true)
        : name === 'companion_presence_claim' ? (options.events ?? [])
          : name === 'companion_verify_stop' ? (options.stopVerifyResult ?? 'allowed') : null
      const error = name === 'companion_presence_stop' ? (options.stopPresenceError ?? null) : options.rpcErrors?.[name] ?? null
      return { error, data }
    },
    from: (table: string) => {
      let nextUpdate: Record<string, unknown> | null = null
      const filters: Record<string, unknown> = {}
      let selected = ''
      const q: Record<string, unknown> = {}
      q.select = (columns: string) => { selected = columns; return q }
      q.eq = (key: string, value: unknown) => { filters[key] = value; return q }
      q.order = () => q
      q.maybeSingle = async () => resultFor(table, selected)
      q.limit = async () => resultFor(table, selected)
      q.update = (values: Record<string, unknown>) => { nextUpdate = values; return q }
      q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        if (nextUpdate) {
          updates.push({ table, values: nextUpdate, filters: { ...filters } })
          nextUpdate = null
          return Promise.resolve({ error: options.updateError ?? null }).then(resolve, reject)
        }
        return Promise.resolve(resultFor(table, selected)).then(resolve, reject)
      }
      return q
    },
  }
  const responseError = (status: number) => Response.json({ error: 'denied' }, { status })
  const mocks: Record<string, unknown> = {
    '@/lib/api-auth': {
      requireParent: async () => !me ? { error: responseError(401) } : role !== 'parent' ? { error: responseError(403) } : { me, admin },
      childInFamily: async (_db: unknown, familyId: string, childId: string) => options.childInFamily !== false && familyId === F && childId === C,
    },
    '@/lib/session': { adminClient: () => admin },
    '@/lib/companion/desktop-server': {
      desktopError: (message: string, status = 400) => Response.json({ error: message }, { status }),
      sameOrigin: (req: { origin?: string }) => req.origin === 'https://family.example',
      limitedJson: async (req: { body: unknown }) => req.body,
      desktopIdentity: async (req: { linked?: boolean }) => req.linked === false ? null : { id: CLIENT },
    },
    '@/lib/push': {
      sendToProfiles: async (_db: unknown, ids: string[], payload: Record<string, unknown>) => {
        pushesInFlight++
        maxPushConcurrency = Math.max(maxPushConcurrency, pushesInFlight)
        if (options.pushDelayMs) await new Promise(resolve => setTimeout(resolve, options.pushDelayMs))
        pushes.push({ ids, payload })
        pushesInFlight--
        return ids.length ? 2 : 0
      },
    },
  }
  const request = (body: unknown = {}, origin = 'https://family.example', authorization = '') => ({
    body, origin, headers: new Headers(authorization ? { authorization } : {}),
    nextUrl: new URL('https://family.example/api/parent/companion/presence?childId=' + C),
  })
  return {
    calls, pushes, updates,
    get maxPushConcurrency() { return maxPushConcurrency },
    presence: load('src/app/api/parent/companion/presence/route.ts', mocks),
    cron: load('src/app/api/cron/companion-presence/route.ts', mocks),
    stop: load('src/app/api/companion/v2/stop/route.ts', mocks),
    request,
  }
}

const evt = (kind: string, overrides: Record<string, unknown> = {}) => ({
  id: EVENT, family_id: F, child_id: C, notify_parent_id: P, client_id: CLIENT, kind,
  occurred_at: '2026-11-11T18:00:00.000Z', device_name: 'Grey’s PC', ...overrides,
})

test('presence GET is parent/family scoped and returns the bounded durable-notice contract', async () => {
  const x = setup({ enabled: true, events: [evt('checkin_missing')] })
  const result = await x.presence.GET(x.request())
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), {
    enabled: true,
    thresholdMinutes: 10,
    events: [evt('checkin_missing')].map(({ id, kind, occurred_at, device_name }) => ({ id, kind, occurred_at, device_name })),
    deliveryNote: 'Monitoring starts after the next fresh PC check-in. Push is best effort and requires browser permission. Notices remain here for 30 days. Push goes to the parent who most recently enabled notices.',
  })
  for (const role of ['none', 'child'] as const) assert.notEqual((await setup({ role }).presence.GET(setup().request())).status, 200)
  assert.equal((await setup({ childInFamily: false }).presence.GET(setup().request())).status, 404)
  assert.equal((await setup({ eventError: { message: 'private DB detail' } }).presence.GET(setup().request())).status, 503)
})

test('presence POST validates same-origin parent scope and calls the scoped settings RPC', async () => {
  const x = setup()
  const result = await x.presence.POST(x.request({ childId: C, enabled: true }))
  assert.equal(result.status, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(x.calls)), [{ name: 'companion_presence_settings_save', args: { p_family: F, p_child: C, p_actor: P, p_enabled: true } }])
  for (const [role, status] of [['none', 401], ['child', 403]] as const) {
    const denied = setup({ role })
    assert.equal((await denied.presence.POST(denied.request({ childId: C, enabled: true }))).status, status)
    assert.equal(denied.calls.length, 0)
  }
  assert.equal((await setup().presence.POST(setup().request({ childId: C, enabled: true }, 'https://attacker.example'))).status, 403)
  assert.equal((await setup().presence.POST(setup().request({ childId: P, enabled: true }))).status, 404)
  assert.equal((await setup().presence.POST(setup().request({ childId: C, enabled: 'true' }))).status, 400)
  const failed = setup({ rpcErrors: { companion_presence_settings_save: { message: 'raw database error' } } })
  const failResponse = await failed.presence.POST(failed.request({ childId: C, enabled: false }))
  assert.equal(failResponse.status, 503)
  assert.equal((await failResponse.text()).includes('raw database'), false)
})

test('presence cron rejects missing, malformed, and unauthorized bearer tokens before scanning', async () => {
  for (const authorization of ['', `Bearer short`, `Bearer ${'a'.repeat(257)}`]) {
    const x = setup()
    assert.equal((await x.cron.POST(x.request({}, '', authorization))).status, 401)
    assert.equal(x.calls.length, 0)
  }
  const denied = setup({ authResult: false })
  assert.equal((await denied.cron.POST(denied.request({}, '', `Bearer ${TOKEN}`))).status, 401)
  assert.deepEqual(denied.calls.map(call => call.name), ['companion_presence_authorized'])
})

test('presence cron sends each notice only to its selected parent and records delivered counts', async () => {
  const events = [evt('stop_requested'), evt('checkin_missing', { id: '40000000-0000-4000-8000-000000000002', notify_parent_id: P2, device_name: 'PC\nName' }), evt('checkin_restored', { id: '40000000-0000-4000-8000-000000000003' })]
  const x = setup({ events })
  const result = await x.cron.POST(x.request({}, '', `Bearer ${TOKEN}`))
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), { ok: true, eventsClaimed: 3, pushDelivered: 6 })
  assert.deepEqual(x.calls.map(call => call.name), ['companion_presence_authorized', 'companion_presence_scan', 'companion_presence_claim'])
  assert.deepEqual(JSON.parse(JSON.stringify(x.pushes.map(push => push.ids))), [[P], [P2], [P]])
  assert.match(String(x.pushes[0].payload.body), /does not confirm the app exited/)
  assert.match(String(x.pushes[1].payload.body), /may be asleep, powered off, or offline/)
  assert.equal(String(x.pushes[1].payload.body).includes('\n'), false)
  assert.match(String(x.pushes[2].payload.body), /resumed checking in/)
  assert.deepEqual(JSON.parse(JSON.stringify(x.updates.map(update => update.values))), [{ push_delivered: 2 }, { push_delivered: 2 }, { push_delivered: 2 }])
})

test('presence cron bounds push concurrency and handles empty claims without sending', async () => {
  const events = Array.from({ length: 12 }, (_, index) => evt('checkin_missing', {
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }))
  const x = setup({ events, pushDelayMs: 5 })
  const result = await x.cron.POST(x.request({}, '', `Bearer ${TOKEN}`))
  assert.equal(result.status, 200)
  assert.equal(x.maxPushConcurrency, 5)
  assert.equal(x.updates.length, 12)
  const empty = setup({ events: [] })
  const emptyResult = await empty.cron.POST(empty.request({}, '', `Bearer ${TOKEN}`))
  assert.deepEqual(await emptyResult.json(), { ok: true, eventsClaimed: 0, pushDelivered: 0 })
  assert.equal(empty.pushes.length, 0)
})

test('presence cron hides database errors and fails closed before processing', async () => {
  const authFailure = setup({ rpcErrors: { companion_presence_authorized: { message: 'secret database detail' } } })
  const denied = await authFailure.cron.POST(authFailure.request({}, '', `Bearer ${TOKEN}`))
  assert.equal(denied.status, 503)
  assert.equal((await denied.text()).includes('secret database'), false)
  assert.equal(authFailure.calls.some(call => call.name === 'companion_presence_scan'), false)
  const scanFailure = setup({ rpcErrors: { companion_presence_scan: { message: 'secret database detail' } } })
  const failed = await scanFailure.cron.POST(scanFailure.request({}, '', `Bearer ${TOKEN}`))
  assert.equal(failed.status, 503)
  assert.equal((await failed.text()).includes('secret database'), false)
  assert.equal(scanFailure.calls.some(call => call.name === 'companion_presence_claim'), false)
  const updateFailure = setup({ events: [evt('checkin_missing')], updateError: { message: 'secret database detail' } })
  const updateResponse = await updateFailure.cron.POST(updateFailure.request({}, '', `Bearer ${TOKEN}`))
  assert.equal(updateResponse.status, 503)
  assert.equal((await updateResponse.text()).includes('secret database'), false)
})

test('stop presence event is recorded only after authorized stop and database failures stay generic', async () => {
  const x = setup()
  const allowed = await x.stop.POST({ ...x.request({ pin: '1234' }), linked: true })
  assert.equal(allowed.status, 200)
  assert.deepEqual(x.calls.slice(-2).map(call => call.name), ['companion_verify_stop', 'companion_presence_stop'])
  assert.deepEqual(JSON.parse(JSON.stringify(x.calls.at(-1)?.args)), { p_client: CLIENT })
  const denied = setup({ stopVerifyResult: 'wrong_pin' })
  const wrong = await denied.stop.POST({ ...denied.request({ pin: '1234' }), linked: true })
  assert.equal(wrong.status, 403)
  assert.equal(denied.calls.some(call => call.name === 'companion_presence_stop'), false)
  const failure = setup({ stopPresenceError: { message: 'private database details' } })
  const failed = await failure.stop.POST({ ...failure.request({ pin: '1234' }), linked: true })
  assert.equal(failed.status, 503)
  assert.equal((await failed.text()).includes('private database'), false)
})

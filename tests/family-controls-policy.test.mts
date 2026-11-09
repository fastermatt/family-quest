import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  cleanSettings, cleanWindows, DEFAULT_SETTINGS, gameDecision, inWindow,
  localParts, nextPolicyExpiry,
} from '../src/lib/family-controls/policy.ts'
import type { FamilySettings, TimeWindow } from '../src/lib/family-controls/types.ts'

const reward = '12345678-1234-4234-8234-123456789abc'
const settings = (overrides: Partial<FamilySettings> = {}): FamilySettings => ({
  ...DEFAULT_SETTINGS,
  enabled: true,
  game_privilege_id: reward,
  ...overrides,
})
const window = (days: number[], start: string, end: string): TimeWindow => ({ days, start, end })

test('settings reject malformed, fractional, string minute values and malformed windows', () => {
  const valid = { ...settings(), enabled: true }
  assert.deepEqual(cleanSettings(valid), valid)
  for (const value of [NaN, 1.5, '120', null, -1, 721]) {
    assert.throws(() => cleanSettings({ ...valid, weekday_minutes: value }), /Weekday minutes must be a whole number/)
  }
  for (const windows of [
    null,
    [null],
    [{ days: [], start: '09:00', end: '10:00' }],
    [{ days: [1.5], start: '09:00', end: '10:00' }],
    [{ days: ['1'], start: '09:00', end: '10:00' }],
    [{ days: [1], start: '9:00', end: '10:00' }],
    [{ days: [1], start: '09:00', end: '24:00' }],
    [{ days: [1], start: '09:00', end: '09:00' }],
    Array.from({ length: 22 }, () => window([1], '09:00', '10:00')),
  ]) assert.throws(() => cleanWindows(windows))
  assert.throws(() => cleanSettings({ ...valid, gaming_windows: [{ days: [1], start: '09:00', end: '09:00' }] }))
})

test('day selection and overnight windows follow the start day', () => {
  const overnight = window([1], '22:00', '02:00')
  assert.equal(inWindow(overnight, 1, 22 * 60), true)
  assert.equal(inWindow(overnight, 1, 23 * 60 + 59), true)
  assert.equal(inWindow(overnight, 2, 60), true)
  assert.equal(inWindow(overnight, 2, 2 * 60), false)
  assert.equal(inWindow(overnight, 0, 23 * 60), false)
  assert.equal(inWindow(window([1], '09:00', '10:00'), 2, 9 * 60 + 30), false)
})

test('bedtime takes precedence over school; school takes precedence over gaming', () => {
  const s = settings({
    school_windows: [window([1], '09:00', '12:00')],
    gaming_windows: [window([1], '09:00', '12:00')],
    bedtime_windows: [window([1], '10:00', '11:00')],
  })
  const school = gameDecision(s, true, 20, false, new Date('2026-11-09T16:30:00Z')) // Monday 09:30 Denver
  assert.equal(school.allowed, false)
  assert.equal(school.reason, 'School time — learning and YouTube stay available.')
  const bedtime = gameDecision(s, true, 20, false, new Date('2026-11-09T17:30:00Z')) // Monday 10:30 Denver
  assert.equal(bedtime.allowed, false)
  assert.equal(bedtime.reason, 'Bedtime — games are unavailable.')
})

test('paused, incomplete responsibilities, exhausted time, and disabled rules deny play', () => {
  const s = settings()
  assert.deepEqual(gameDecision(s, true, 10, true, new Date('2026-11-09T15:00:00Z')).reason, 'Games are paused by a parent.')
  assert.equal(gameDecision(s, false, 10, false, new Date('2026-11-09T15:00:00Z')).reason, 'Finish or correct your required responsibilities.')
  assert.equal(gameDecision(s, true, 0, false, new Date('2026-11-09T15:00:00Z')).reason, 'Today’s earned game time is used up.')
  const disabled = gameDecision({ ...s, enabled: false }, true, 10, false, new Date('2026-11-09T15:00:00Z'))
  assert.equal(disabled.allowed, false)
  assert.equal(disabled.reason, 'Family game rules are not enabled.')
})

test('policy expiry clips at a routine transition and local midnight', () => {
  const monday = settings({ school_windows: [window([1], '09:00', '09:10')] })
  assert.equal(nextPolicyExpiry(monday, new Date('2026-11-09T16:05:30Z')), '2026-11-09T16:10:00.000Z')
  const midnight = nextPolicyExpiry(settings(), new Date('2026-11-09T06:55:00Z'))
  assert.equal(midnight, '2026-11-09T07:00:00.000Z') // 00:00 MST
})

test('policy expiry follows Denver DST transitions and the local calendar day', () => {
  const beforeSpringJump = new Date('2026-03-08T08:55:00Z') // 01:55 MST
  assert.equal(localParts(beforeSpringJump, 'America/Denver').day, '2026-03-08')
  assert.equal(nextPolicyExpiry(settings(), beforeSpringJump), '2026-03-08T09:10:00.000Z') // 15 minute lease crosses the skipped 02:00 hour
  const beforeFallMidnight = new Date('2026-11-01T05:55:00Z') // 23:55 MDT on Oct 31
  assert.equal(localParts(beforeFallMidnight, 'America/Denver').day, '2026-10-31')
  assert.equal(nextPolicyExpiry(settings(), beforeFallMidnight), '2026-11-01T06:00:00.000Z') // midnight MDT
})

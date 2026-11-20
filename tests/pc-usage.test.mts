import test from 'node:test'
import assert from 'node:assert/strict'
import {pcUsageCoverage,summarizePCUsage} from '../src/lib/companion/pc-usage.ts'

test('parent Today joins foreground apps to effective rules before totaling games', () => {
  // The companion API sends app durations and effective classifications separately.
  const apps = [
    { executable: 'rainbowsix.exe', seconds: 1800 },
    { executable: 'homework.exe', seconds: 2400 },
    { executable: 'modernwarfare.exe', seconds: 900 },
    { executable: 'chrome.exe', seconds: 600 },
  ]
  const rules = [
    { executable: 'rainbowsix.exe', label: 'Rainbow Six', category: 'game' },
    { executable: 'homework.exe', label: 'Schoolwork', category: 'school' },
    { executable: 'modernwarfare.exe', label: 'Modern Warfare', category: 'game' },
    { executable: 'chrome.exe', label: 'Chrome', category: 'other' },
  ]
  assert.deepEqual(summarizePCUsage(apps, rules), {
    gamingSeconds: 2700,
    topGame: { executable: 'rainbowsix.exe', label: 'Rainbow Six', seconds: 1800 },
  })
  assert.deepEqual(summarizePCUsage(apps, rules.map(rule => rule.executable === 'rainbowsix.exe' ? {...rule, category: 'school'} : rule)), {
    gamingSeconds: 900,
    topGame: { executable: 'modernwarfare.exe', label: 'Modern Warfare', seconds: 900 },
  })
})


test('recent contact does not make old or missing activity current', () => {
  const now = Date.parse('2026-11-13T20:00:00Z')
  assert.equal(pcUsageCoverage('2026-11-13T17:18:00Z', '2026-11-13T19:59:00Z', now).current, false)
  assert.equal(pcUsageCoverage(null, '2026-11-13T19:59:00Z', now).current, false)
  assert.equal(pcUsageCoverage('2026-11-13T19:55:00Z', '2026-11-13T19:59:00Z', now).current, true)
  assert.match(pcUsageCoverage('2026-11-13T17:18:00Z', '2026-11-13T19:18:00Z', now).message ?? '', /not checked in/)
})

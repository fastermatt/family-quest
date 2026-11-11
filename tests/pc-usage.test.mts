import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizePCUsage} from '../src/lib/companion/pc-usage.ts'

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

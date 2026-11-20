import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeChores, type ChoreRow } from '../src/lib/companion/chores.ts'
import { denverDay } from '../src/lib/companion/activity.ts'

const row = (id: string, status: string, proof_type: string, required = true): ChoreRow => ({
  id, status, template: { name: id, required, xp_value: 100, proof_type },
})

test('chore summary respects proof requirements and optional chores', () => {
  const day = denverDay(new Date('2026-11-13T05:59:00Z'))
  assert.equal(day, '2026-11-12')
  const photo = row('photo', 'submitted', 'photo')
  const check = row('check', 'submitted', 'check')
  const optional = row('optional', 'pending', 'check', false)
  assert.equal(summarizeChores([photo, optional], day, 'Child', false).allDone, true)
  assert.equal(summarizeChores([photo], day, 'Child', true).allDone, false)
  const mixed = summarizeChores([photo, check, optional, row('redo', 'rejected', 'photo')], day, 'Child', false)
  assert.equal(mixed.allDone, false)
  assert.equal(mixed.totalRequired, 3)
  assert.equal(mixed.pendingCount, 1)
  assert.equal(mixed.submittedCount, 2)
  assert.equal(mixed.chores[0].status, 'rejected')
  assert.equal(summarizeChores([], day, 'Child', false).allDone, false)
})

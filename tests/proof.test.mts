import test from 'node:test'
import assert from 'node:assert/strict'
import { privilegeUnlocked, countsTowardUnlock, proofTypeOf, isPastCutoff } from '../src/lib/proof.ts'
import { zonedParts, addDays, formatClock, todayInTz } from '../src/lib/dates.ts'

const photo = { proof_type: 'photo', required: true }
const check = { proof_type: 'check', required: true }

test('proofTypeOf falls back to photo_required before migration', () => {
  assert.equal(proofTypeOf({ photo_required: true }), 'photo')
  assert.equal(proofTypeOf({ photo_required: false }), 'check')
  assert.equal(proofTypeOf({ proof_type: 'imessage_video' }), 'imessage_video')
  assert.equal(proofTypeOf(undefined), 'check')
})

test('a submitted photo counts, a submitted check-off does not', () => {
  assert.equal(countsTowardUnlock({ id: '1', status: 'submitted', task_template: photo }), true)
  assert.equal(countsTowardUnlock({ id: '2', status: 'submitted', task_template: check }), false)
  assert.equal(countsTowardUnlock({ id: '3', status: 'approved', task_template: check }), true)
  assert.equal(countsTowardUnlock({ id: '4', status: 'rejected', task_template: photo }), false)
  assert.equal(countsTowardUnlock({ id: '5', status: 'pending', task_template: photo }), false)
})

test('optional chores never block a reward', () => {
  const t = { id: '1', status: 'pending', task_template: { proof_type: 'photo', required: false } }
  assert.equal(countsTowardUnlock(t), true)
})

test('all_tasks stays locked with no chores, then unlocks when all are shown', () => {
  const priv = { gating_mode: 'all_tasks' }
  assert.equal(privilegeUnlocked(priv, []), false)
  const tasks = [
    { id: 'a', status: 'submitted', task_template: photo },
    { id: 'b', status: 'approved', task_template: check },
  ]
  assert.equal(privilegeUnlocked(priv, tasks), true)
  tasks[1].status = 'submitted'
  assert.equal(privilegeUnlocked(priv, tasks), false)
})

test('a rejected photo re-locks the reward', () => {
  const priv = { gating_mode: 'all_tasks' }
  const tasks = [{ id: 'a', status: 'rejected', task_template: photo }]
  assert.equal(privilegeUnlocked(priv, tasks), false)
})

test('specific_tasks needs every listed template, and a list', () => {
  const tasks = [
    { id: 'a', template_id: 't1', status: 'approved', task_template: check },
    { id: 'b', template_id: 't2', status: 'pending', task_template: photo },
  ]
  assert.equal(privilegeUnlocked({ gating_mode: 'specific_tasks', required_template_ids: ['t1'] }, tasks), true)
  assert.equal(privilegeUnlocked({ gating_mode: 'specific_tasks', required_template_ids: ['t1', 't2'] }, tasks), false)
  assert.equal(privilegeUnlocked({ gating_mode: 'specific_tasks', required_template_ids: [] }, tasks), false)
})

test('cutoff', () => {
  assert.equal(isPastCutoff('09:00:00', 9 * 60 + 1), true)
  assert.equal(isPastCutoff('09:00:00', 8 * 60), false)
  assert.equal(isPastCutoff(null, 23 * 60), false)
})

test('Denver date, not UTC: 9pm MDT on Oct 8 is still Oct 8', () => {
  const d = new Date('2026-10-09T03:00:00Z') // 21:00 MDT Oct 8
  assert.equal(todayInTz(d), '2026-10-08')
  const p = zonedParts(d)
  assert.equal(p.dayOfWeek, 4) // Thursday
  assert.equal(p.minutes, 21 * 60)
})

test('DST: Nov 1 2026 01:30 UTC-7 vs UTC-6 handled by Intl', () => {
  assert.equal(todayInTz(new Date('2026-11-02T06:30:00Z')), '2026-11-01') // 23:30 MST Nov 1
})

test('addDays and formatClock', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(formatClock('09:00:00'), '9:00 AM')
  assert.equal(formatClock('00:05:00'), '12:05 AM')
  assert.equal(formatClock('17:30'), '5:30 PM')
})

import { cleanChore } from '../src/lib/chores.ts'

test('cleanChore: new chore defaults and validation', () => {
  const ok = cleanChore({ name: '  Piano practice ', proof_type: 'imessage_video', recurrence_type: 'weekdays', cutoff_time: '17:30' }, false)
  assert.equal(ok.error, undefined)
  assert.equal(ok.values!.name, 'Piano practice')
  assert.equal(ok.values!.photo_required, false)
  assert.equal(ok.values!.cutoff_time, '17:30:00')
  assert.equal(ok.values!.xp_value, 100)
  assert.equal(cleanChore({ name: '' }, false).error, 'Give the chore a name.')
  assert.equal(cleanChore({ name: 'x', proof_type: 'selfie' }, false).error, 'Pick how Grey proves it.')
  assert.equal(cleanChore({ name: 'x', recurrence_type: 'weekly', recurrence_days: [] }, false).error, 'Pick at least one day.')
  assert.equal(cleanChore({ name: 'x', cutoff_time: '25:00' }, false).error, 'That time does not look right.')
  assert.deepEqual(cleanChore({ name: 'x', recurrence_type: 'weekly', recurrence_days: [3, 1, 1, 9] }, false).values!.recurrence_days, [1, 3])
})

test('cleanChore: partial update only touches given fields', () => {
  const r = cleanChore({ cutoff_time: null }, true)
  assert.deepEqual(r.values, { cutoff_time: null })
  assert.equal(cleanChore({ xp_value: 99999 }, true).values!.xp_value, 1000)
})

import { defaultPhotoHint, photoPrompt } from '../src/lib/proof.ts'

test('photo hints match the chore', () => {
  assert.match(defaultPhotoHint('Make bed'), /made bed/)
  assert.match(defaultPhotoHint('Fill Chickens water'), /waterer/)
  assert.match(defaultPhotoHint('Fill Chickens Food'), /feeder/)
  assert.match(defaultPhotoHint('Get Eggs'), /eggs/)
  assert.match(defaultPhotoHint('Take out trash'), /curb/)
  assert.match(defaultPhotoHint('Polish the piano'), /polish the piano/)
  assert.equal(photoPrompt({ name: 'Make bed', photo_hint: 'Custom' }), '📸 Custom')
  assert.match(photoPrompt({ name: 'Make bed', photo_hint: '  ' }), /made bed/)
})

import { QUESTIONS, cleanAnswer, questionFor } from '../src/lib/reflection.ts'

test('question of the day rotates and is stable for a date', () => {
  assert.equal(questionFor('2026-10-09'), questionFor('2026-10-09'))
  assert.notEqual(questionFor('2026-10-09'), questionFor('2026-10-10'))
  const seen = new Set(Array.from({ length: QUESTIONS.length }, (_, i) => questionFor(addDays('2026-10-09', i))))
  assert.equal(seen.size, QUESTIONS.length)
})

test('answers must be a real sentence', () => {
  assert.ok(cleanAnswer('idk').error)
  assert.ok(cleanAnswer(42).error)
  assert.equal(cleanAnswer('  I learned   to fold my shirts.  ').answer, 'I learned to fold my shirts.')
})

import { cleanTraining, winPromptFor } from '../src/lib/training.ts'

test('training log validation', () => {
  assert.ok(cleanTraining({ skills: [], worked_on: 'lots of planche', win: 'held it' }).error)
  assert.ok(cleanTraining({ skills: ['Planche'], worked_on: 'x', win: 'held it' }).error)
  assert.ok(cleanTraining({ skills: ['Planche'], worked_on: '5 sets of tuck planche', win: '' }).error)
  const ok = cleanTraining({ skills: ['Planche', 'Planche', 'Hacking'], worked_on: '5 sets of tuck planche', win: '12 second hold' })
  assert.deepEqual(ok.values?.skills, ['Planche'])
  assert.equal(cleanTraining({ rest_day: true }).values?.rest_day, true)
  assert.equal(winPromptFor('2026-10-09'), winPromptFor('2026-10-09'))
})

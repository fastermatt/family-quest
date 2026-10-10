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

import { groupChores, progressCounts, progressLine, isPrivateHost, actionLabel } from '../src/lib/kid-view.ts'

const mk = (id: string, status: string, tt: Record<string, unknown> = {}) => ({
  id,
  status,
  task_template: { proof_type: 'check', required: true, ...tt },
})

test('groupChores splits fix / next / waiting / finished', () => {
  const g = groupChores(
    [
      mk('a', 'rejected'),
      mk('b', 'pending'),
      mk('c', 'submitted'),
      mk('d', 'submitted', { proof_type: 'photo' }),
      mk('e', 'approved'),
      mk('f', 'missed'),
    ],
    600
  )
  assert.deepEqual(g.fix.map((t) => t.id), ['a'])
  assert.deepEqual(g.next.map((t) => t.id).sort(), ['b', 'f'])
  assert.deepEqual(g.waiting.map((t) => t.id), ['c'])
  assert.deepEqual(g.finished.map((t) => t.id).sort(), ['d', 'e'])
})

test('Do next sorts late first, then cutoff, then time of day', () => {
  const g = groupChores(
    [
      mk('none-eve', 'pending', { time_of_day: 'evening' }),
      mk('none-morn', 'pending', { time_of_day: 'morning' }),
      mk('cut-1700', 'pending', { cutoff_time: '17:00', time_of_day: 'afternoon' }),
      mk('late-0800', 'pending', { cutoff_time: '08:00', time_of_day: 'morning' }),
      mk('cut-1200', 'pending', { cutoff_time: '12:00', time_of_day: 'morning' }),
    ],
    9 * 60
  )
  assert.deepEqual(g.next.map((t) => t.id), ['late-0800', 'cut-1200', 'cut-1700', 'none-morn', 'none-eve'])
})

test('progressCounts ignores extras and separates waiting from to do', () => {
  const p = progressCounts([
    mk('1', 'pending'),
    mk('2', 'rejected'),
    mk('3', 'submitted'),
    mk('4', 'submitted', { proof_type: 'photo' }),
    mk('5', 'pending', { required: false }),
  ])
  assert.deepEqual(p, { total: 4, toDo: 2, waiting: 1, done: 1, allDone: false })
  assert.equal(progressLine(p), '2 to do · 1 waiting on a parent')
  assert.equal(progressLine({ ...p, toDo: 0 }), 'Your part is done. Waiting for a parent.')
  assert.equal(progressLine({ ...p, toDo: 0, waiting: 0, done: 4, allDone: true }), 'All chores shown. Rewards are open.')
  assert.equal(progressLine({ ...p, waiting: 0 }), '2 to do')
})

test('isPrivateHost flags home-network links only', () => {
  for (const u of ['http://192.168.1.5/x', 'http://10.0.0.2', 'http://172.16.4.1', 'http://172.31.0.1', 'http://mac.local:3000', 'http://localhost:3000']) {
    assert.equal(isPrivateHost(u), true, u)
  }
  for (const u of ['https://khanacademy.org', 'http://172.32.0.1', 'http://172.15.0.1', 'http://8.8.8.8', 'nonsense', null]) {
    assert.equal(isPrivateHost(u), false, String(u))
  }
})

test('actionLabel matches the visible action', () => {
  assert.equal(actionLabel('photo', 'rejected'), 'Redo')
  assert.equal(actionLabel('photo', 'pending'), 'Take photo')
  assert.equal(actionLabel('imessage_video', 'pending'), 'Sent it')
  assert.equal(actionLabel('check', 'pending'), 'Done')
})

import { choresLeft, isCrunchTime } from '../src/lib/kid-view.ts'

test('4 PM crunch flags unfinished required chores only', () => {
  const t = (status: string, required = true) => ({ id: status, status, task_template: { required } })
  const tasks = [t('pending'), t('rejected'), t('submitted'), t('approved'), t('pending', false)]
  assert.equal(choresLeft(tasks), 2)
  assert.equal(isCrunchTime(15 * 60 + 59, 2), false)
  assert.equal(isCrunchTime(16 * 60, 2), true)
  assert.equal(isCrunchTime(20 * 60, 0), false)
})

import { cleanAnswers, cleanQuestions, countsWhenSent } from '../src/lib/proof.ts'

test('written proof counts when sent and needs real answers', () => {
  assert.equal(countsWhenSent('written'), true)
  assert.equal(countsWhenSent('check'), false)
  assert.equal(countsTowardUnlock({ id: 'x', status: 'submitted', task_template: { proof_type: 'written' } }), true)
  assert.deepEqual(cleanQuestions(['  What did you read? ', '', 42, 'a', 'b', 'c']), ['What did you read?', 'a', 'b'])
  const qs = ['What did you read?', 'What did you learn?']
  assert.ok(cleanAnswers(qs, ['John 3', 'that God loves the world']).error, 'too short')
  assert.ok(cleanAnswers(qs, ['John chapter 3']).error, 'missing second')
  const ok = cleanAnswers(qs, ['John chapter 3  ', 'God loved the world so he sent Jesus'])
  assert.equal(ok.answers?.[0].a, 'John chapter 3')
  assert.equal(ok.answers?.[1].q, 'What did you learn?')
})

test('excused counts as done and lands in Finished', () => {
  assert.equal(countsTowardUnlock({ id: 'e', status: 'excused', task_template: { proof_type: 'check' } }), true)
  const g = groupChores([{ id: 'e', status: 'excused', task_template: {} }], 600)
  assert.equal(g.finished.length, 1)
  assert.equal(choresLeft([{ id: 'e', status: 'excused', task_template: { required: true } }]), 0)
})

// ---- progress history ----
import { dayDone, dayMissed, isOnTime, summarizeDay, summarizePeriod, streaks, dayLook } from '../src/lib/history.ts'

test('dayDone matches the unlock rule', () => {
  assert.equal(dayDone('approved', 'check'), true)
  assert.equal(dayDone('excused', 'photo'), true)
  assert.equal(dayDone('submitted', 'photo'), true)
  assert.equal(dayDone('submitted', 'written'), true)
  assert.equal(dayDone('submitted', 'check'), false)
  assert.equal(dayDone('submitted', 'imessage_video'), false)
  assert.equal(dayDone('pending', 'photo'), false)
  assert.equal(dayDone('rejected', 'photo'), false)
  assert.equal(dayDone('missed', 'photo'), false)
})

test('dayMissed: pending and rejected only count once the day is over', () => {
  assert.equal(dayMissed('missed', false), true)
  assert.equal(dayMissed('pending', false), false)
  assert.equal(dayMissed('pending', true), true)
  assert.equal(dayMissed('rejected', true), true)
  assert.equal(dayMissed('submitted', true), false)
})

test('isOnTime uses Denver clock time against the cutoff', () => {
  // 2026-10-05 is MDT (UTC-6): 15:30Z = 9:30 AM, 16:30Z = 10:30 AM
  const base = { status: 'submitted', proofType: 'photo', cutoffTime: '10:00:00', dueDate: '2026-10-05' }
  assert.equal(isOnTime({ ...base, submittedAt: '2026-10-05T15:30:00Z' }), true)
  assert.equal(isOnTime({ ...base, submittedAt: '2026-10-05T16:30:00Z' }), false)
  assert.equal(isOnTime({ ...base, submittedAt: '2026-10-05T16:00:00Z' }), true) // exactly 10:00
  // sent the next morning: clock time is early but the day is wrong
  assert.equal(isOnTime({ ...base, submittedAt: '2026-10-06T14:00:00Z' }), false)
  // no cutoff: on time if done
  assert.equal(isOnTime({ ...base, cutoffTime: null, submittedAt: '2026-10-05T23:00:00Z' }), true)
  // not done is never on time
  assert.equal(isOnTime({ ...base, status: 'pending', submittedAt: null }), false)
  // excused has no timestamp and cannot be late
  assert.equal(isOnTime({ ...base, status: 'excused', submittedAt: null }), true)
})

test('summarizeDay counts required chores only', () => {
  const s = summarizeDay([
    { status: 'approved', proofType: 'photo', cutoffTime: '10:00:00', submittedAt: '2026-10-05T15:00:00Z', dueDate: '2026-10-05' },
    { status: 'approved', proofType: 'photo', cutoffTime: '10:00:00', submittedAt: '2026-10-05T18:00:00Z', dueDate: '2026-10-05' },
    { status: 'excused', proofType: 'check' },
    { status: 'pending', proofType: 'photo' },
    { status: 'missed', proofType: 'check' },
    { status: 'pending', proofType: 'photo', required: false },
  ])
  assert.deepEqual(s, { total: 5, done: 3, missed: 2, excused: 1, onTime: 2, pct: 60 })
})

test('summarizeDay on today does not call pending missed', () => {
  const s = summarizeDay([{ status: 'pending', proofType: 'photo' }, { status: 'submitted', proofType: 'photo' }], false)
  assert.deepEqual(s, { total: 2, done: 1, missed: 0, excused: 0, onTime: 1, pct: 50 })
  assert.equal(summarizeDay([]).pct, 0)
  assert.equal(summarizeDay([]).total, 0)
})

const D = (date: string, total: number, done: number, onTime = done) => ({
  date, total, done, missed: total - done, excused: 0, onTime, pct: total ? Math.round((done / total) * 100) : 0,
})

test('streaks skip empty days and ignore an unfinished today', () => {
  const days = [D('2026-10-01', 3, 3), D('2026-10-02', 0, 0), D('2026-10-03', 3, 3), D('2026-10-04', 3, 3), D('2026-10-05', 3, 1)]
  assert.deepEqual(streaks(days, '2026-10-05'), { current: 3, best: 3 })
  // once today is complete it counts
  days[4] = D('2026-10-05', 3, 3)
  assert.deepEqual(streaks(days, '2026-10-05'), { current: 4, best: 4 })
})

test('streaks: a missed past day resets, best remembers', () => {
  const days = [D('2026-10-01', 2, 2), D('2026-10-02', 2, 2), D('2026-10-03', 2, 2), D('2026-10-04', 2, 1), D('2026-10-05', 2, 2), D('2026-10-06', 2, 0)]
  assert.deepEqual(streaks(days, '2026-10-07'), { current: 0, best: 3 })
  assert.deepEqual(streaks(days.slice(0, 5), '2026-10-07'), { current: 1, best: 3 })
  assert.deepEqual(streaks([], '2026-10-07'), { current: 0, best: 0 })
  assert.deepEqual(streaks([D('2026-10-07', 2, 0)], '2026-10-07'), { current: 0, best: 0 })
})

test('summarizePeriod weights by chores and leaves out unfinished today', () => {
  const days = [D('2026-10-01', 4, 4), D('2026-10-02', 0, 0), D('2026-10-03', 4, 2, 1), D('2026-10-04', 2, 0)]
  assert.deepEqual(summarizePeriod(days, '2026-10-05'), { pct: 60, onTimePct: 83, perfectDays: 1, daysTracked: 3 })
  assert.deepEqual(summarizePeriod([D('2026-10-05', 4, 1)], '2026-10-05'), { pct: 0, onTimePct: 0, perfectDays: 0, daysTracked: 0 })
  assert.deepEqual(summarizePeriod([D('2026-10-05', 4, 4)], '2026-10-05'), { pct: 100, onTimePct: 100, perfectDays: 1, daysTracked: 1 })
  assert.deepEqual(summarizePeriod([]), { pct: 0, onTimePct: 0, perfectDays: 0, daysTracked: 0 })
})

test('dayLook', () => {
  assert.equal(dayLook(D('x', 0, 0), false), 'none')
  assert.equal(dayLook(D('x', 3, 3), false), 'perfect')
  assert.equal(dayLook(D('x', 3, 2), false), 'missed')
  assert.equal(dayLook(D('x', 3, 0), false), 'missed')
  assert.equal(dayLook(D('x', 3, 1), true), 'partial')
  assert.equal(dayLook({ ...D('x', 3, 2), missed: 0 }, false), 'partial')
})

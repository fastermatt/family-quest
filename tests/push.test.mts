import test from 'node:test'
import assert from 'node:assert/strict'
import { afternoonPayload, eveningPayload, fourParentPayload, morningPayload, namesList, submitBody } from '../src/lib/push-copy.ts'

const c = (name: string, status: string, required = true) => ({ name, status, required })

test('morning names the first chore left', () => {
  const p = morningPayload([c('Dishes', 'approved'), c('Trash', 'pending')])!
  assert.equal(p.body, '2 chores today. Start with: Trash.')
  assert.equal(morningPayload([]), null)
})

test('afternoon ignores optional chores and stays quiet when done', () => {
  assert.equal(afternoonPayload([c('A', 'approved'), c('B', 'pending', false)]), null)
  assert.equal(afternoonPayload([c('A', 'rejected')])!.title, '1 chore left')
})

test('four parent list caps at 3 names', () => {
  const p = fourParentPayload('Grey', ['a', 'b', 'c', 'd'].map((n) => c(n, 'pending')))!
  assert.equal(p.title, 'Grey still has 4 chores')
  assert.equal(p.body, 'a, b, c and 1 more')
  assert.equal(namesList(['x']), 'x')
})

test('evening summary counts shown work and mentions the answer', () => {
  const p = eveningPayload('Grey', [c('A', 'approved'), c('B', 'submitted'), c('C', 'missed')], true)!
  assert.equal(p.title, 'Grey: 2 of 3 done today')
  assert.match(p.body, /Not done: C\./)
  assert.match(p.body, /Read his answer/)
})

test('submit body per proof type', () => {
  assert.equal(submitBody('photo'), 'Photo is in. Tap to check it.')
  assert.match(submitBody('check'), /Tap to confirm/)
})

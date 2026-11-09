import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { scheduledReminderPayload, validReminderTime, validReminderId } from '../src/lib/reminder-schedule.ts'
const chore = (status: string, required = true) => ({ name: 'Make bed', status, required })
test('daily reminders validate exact local times and ids', () => {
  for (const t of ['00:00', '23:59', '15:30']) assert.ok(validReminderTime(t))
  for (const t of ['24:00','09:60','9:00',null,'12:00:00']) assert.ok(!validReminderTime(t))
  assert.ok(validReminderId('12345678-1234-4234-8234-123456789abc'))
  assert.ok(!validReminderId('other-family'))
})
test('required unfinished chores are counted; bonus and review chores are not left', () => {
  const p = scheduledReminderPayload('Greyson', [chore('pending'),chore('rejected'),chore('missed'),chore('approved'),chore('submitted'),chore('pending',false)],'test')
  assert.equal(p.title, '3 chores left today')
  assert.match(p.body, /1 awaiting parent review/)
  assert.equal(p.url,'/home')
})
test('congratulations distinguish submitted, approved and a day with no chores', () => {
  assert.match(scheduledReminderPayload('Greyson',[chore('submitted')],'t').body,/awaiting parent review/)
  assert.equal(scheduledReminderPayload('Greyson',[chore('approved'),chore('excused')],'t').title,'You did it! All chores done')
  assert.match(scheduledReminderPayload('Greyson',[],'t').body,/no required chores/)
  assert.equal(scheduledReminderPayload('Greyson',[chore('pending')],'t').title,'1 chore left today')
})

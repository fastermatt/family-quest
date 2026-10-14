import { NextRequest, NextResponse } from 'next/server'
import { bad, childInFamily, requireParent } from '@/lib/api-auth'
import { validReminderId, validReminderTime } from '@/lib/reminder-schedule'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const childId = req.nextUrl.searchParams.get('childId')
  if (!validReminderId(childId) || !(await childInFamily(auth.admin, auth.me.family_id, childId))) return bad('Child not found.', 404)
  const { data, error } = await auth.admin.from('reminder_schedules').select('id, child_id, time, enabled').eq('family_id', auth.me.family_id).eq('child_id', childId).order('time')
  if (error) return bad('Reminder times could not load. Try again.', 503)
  return NextResponse.json({ schedules: data })
}

async function change(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return bad('Open ChoreZap to change reminders.', 403)
  const body = await req.json().catch(() => null)
  if (!validReminderId(body?.childId) || !(await childInFamily(auth.admin, auth.me.family_id, body.childId))) return bad('Child not found.', 404)
  const { admin, me } = auth
  if (req.method !== 'POST' && !validReminderId(body?.id)) return bad('Choose a reminder to change.')
  if (req.method !== 'DELETE' && (!validReminderTime(body?.time) || typeof body?.enabled !== 'boolean')) return bad('Choose a valid reminder time.')
  const scope = () => admin.from('reminder_schedules')
  const result = req.method === 'POST'
    ? await scope().insert({ child_id: body.childId, family_id: me.family_id, time: body.time, enabled: body.enabled }).select('id').single()
    : req.method === 'PATCH'
      ? await scope().update({ time: body.time, enabled: body.enabled }).eq('family_id', me.family_id).eq('child_id', body.childId).eq('id', body.id).select('id').maybeSingle()
      : await scope().delete().eq('family_id', me.family_id).eq('child_id', body.childId).eq('id', body.id).select('id').maybeSingle()
  if (result.error?.code === '23505') return bad('A reminder already exists at that time.', 409)
  if (result.error) return bad('Could not save reminder times. Try again.', 503)
  if (!result.data) return bad('Reminder not found.', 404)
  return NextResponse.json({ ok: true })
}
export const POST = change
export const PATCH = change
export const DELETE = change

import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { todayInTz, zonedParts } from '@/lib/dates'
import { activeOnly } from '@/lib/proof'
import { parentIds, sendToProfiles } from '@/lib/push'
import {
  afternoonPayload,
  eveningPayload,
  fourKidPayload,
  fourParentPayload,
  morningPayload,
  type PushChore,
  type PushPayload,
} from '@/lib/push-copy'

export const dynamic = 'force-dynamic'

const SLOTS = ['morning', 'afternoon', 'four', 'evening']

// The scheduler runs in UTC and fires at both the summer and winter UTC times.
// Only the run that lands in the right Denver hour does anything.
const SLOT_HOUR: Record<string, number> = { morning: 7, afternoon: 15, four: 16, evening: 20 }

async function run(req: NextRequest) {
  // Two ways in: the secret (manual runs and tests, may force), or the database
  // scheduler, which has no secret. Without the secret a run only happens in
  // its Denver hour and at most once per slot per day, so a stray caller can
  // only send the reminder that was going out anyway.
  const secret = process.env.PUSH_CRON_SECRET
  const trusted = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const slot = req.nextUrl.searchParams.get('slot') ?? ''
  if (!SLOTS.includes(slot)) {
    return NextResponse.json({ error: 'slot must be morning, afternoon, four or evening.' }, { status: 400 })
  }

  const force = trusted && req.nextUrl.searchParams.get('force') === '1'
  const denverHour = Math.floor(zonedParts(new Date()).minutes / 60)
  if (!force && denverHour !== SLOT_HOUR[slot]) {
    return NextResponse.json({ ok: true, slot, skipped: 'not this hour in Denver', denverHour })
  }

  const admin = adminClient()
  const today = todayInTz()
  if (!force) {
    // Claim this slot for today; a second call the same day does nothing.
    const { error: claimErr } = await admin.from('reminder_runs').insert({ slot, day: today })
    if (claimErr) return NextResponse.json({ ok: true, slot, skipped: 'already ran today' })
  }
  const { data: kids } = await admin.from('profiles').select('id, name, family_id').eq('role', 'child')

  let kidPushes = 0
  let parentPushes = 0
  let skipped = 0
  const parentCache = new Map<string, string[]>()
  const parentsOf = async (fam: string) => {
    if (!parentCache.has(fam)) parentCache.set(fam, await parentIds(admin, fam))
    return parentCache.get(fam)!
  }

  for (const kid of kids ?? []) {
    const { data } = await admin
      .from('task_instances')
      .select('id, status, task_template:task_templates(name, required, active)')
      .eq('assigned_to', kid.id)
      .eq('due_date', today)
    const chores: PushChore[] = activeOnly(data).map((r) => ({
      name: r.task_template?.name ?? 'Chore',
      status: r.status,
      required: r.task_template?.required !== false,
    }))
    if (!chores.length) {
      skipped++
      continue
    }

    const toKid = async (p: PushPayload | null) => {
      if (p) kidPushes += await sendToProfiles(admin, [kid.id], p)
    }
    const toParents = async (p: PushPayload | null) => {
      if (p) parentPushes += await sendToProfiles(admin, await parentsOf(kid.family_id), p)
    }

    if (slot === 'morning') await toKid(morningPayload(chores))
    else if (slot === 'afternoon') await toKid(afternoonPayload(chores))
    else if (slot === 'four') {
      await toKid(fourKidPayload(chores))
      await toParents(fourParentPayload(kid.name, chores))
    } else {
      const { data: refl } = await admin
        .from('reflections')
        .select('answer')
        .eq('profile_id', kid.id)
        .eq('day', today)
        .maybeSingle()
      await toParents(eveningPayload(kid.name, chores, !!refl?.answer))
    }
  }

  return NextResponse.json({ ok: true, slot, date: today, kidPushes, parentPushes, kidsSkipped: skipped })
}

export const GET = run
export const POST = run

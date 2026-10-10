import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { todayInTz } from '@/lib/dates'
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

async function run(req: NextRequest) {
  const secret = process.env.PUSH_CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'PUSH_CRON_SECRET is not set.' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const slot = req.nextUrl.searchParams.get('slot') ?? ''
  if (!SLOTS.includes(slot)) {
    return NextResponse.json({ error: 'slot must be morning, afternoon, four or evening.' }, { status: 400 })
  }

  const admin = adminClient()
  const today = todayInTz()
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

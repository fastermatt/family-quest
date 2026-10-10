import { NextRequest, NextResponse } from 'next/server'
import { bad, childInFamily, requireParent } from '@/lib/api-auth'
import { todayInTz } from '@/lib/dates'
import { dayDone, isOnTime } from '@/lib/history'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// One child, one day: every chore with its status, proof and notes, plus that day's question and training log.
export async function GET(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { me, admin } = auth

  const params = new URL(req.url).searchParams
  const child = params.get('child') ?? ''
  const date = params.get('date') ?? ''
  if (!child) return bad('Pick a child.')
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return bad('Pick a date.')
  if (!(await childInFamily(admin, me.family_id, child))) return bad('Not your family.', 403)

  const [{ data: tasks, error }, { data: reflection }, { data: training }] = await Promise.all([
    admin
      .from('task_instances')
      .select('id, status, submitted_at, review_note, photo_url, answers, task_template:task_templates(name, proof_type, required, cutoff_time)')
      .eq('assigned_to', child)
      .eq('due_date', date),
    admin.from('reflections').select('question, answer').eq('profile_id', child).eq('day', date).maybeSingle(),
    admin
      .from('training_logs')
      .select('rest_day, skills, worked_on, win_prompt, win')
      .eq('profile_id', child)
      .eq('day', date)
      .maybeSingle(),
  ])
  if (error) return bad('Could not load that day.', 500)

  const past = date < todayInTz()
  const chores = (tasks ?? [])
    .map((t) => {
      const tpl = Array.isArray(t.task_template) ? t.task_template[0] : t.task_template
      if (!tpl) return null
      return {
        id: t.id,
        name: tpl.name as string,
        proofType: tpl.proof_type as string,
        status: t.status as string,
        required: tpl.required !== false,
        submittedAt: t.submitted_at as string | null,
        cutoff: (tpl.cutoff_time as string | null) ?? null,
        // true / false once it is done; null while it is not done at all
        onTime: dayDone(t.status, tpl.proof_type)
          ? isOnTime({ status: t.status, proofType: tpl.proof_type, cutoffTime: tpl.cutoff_time, submittedAt: t.submitted_at, dueDate: date })
          : null,
        // a past pending/rejected chore reads as missed in the UI
        missed: t.status === 'missed' || (past && (t.status === 'pending' || t.status === 'rejected')),
        hasPhoto: !!t.photo_url,
        answers: (t.answers ?? null) as { q: string; a: string }[] | null,
        reviewNote: t.review_note as string | null,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => Number(b.required) - Number(a.required) || (a.cutoff ?? '99').localeCompare(b.cutoff ?? '99') || a.name.localeCompare(b.name))

  return NextResponse.json({
    date,
    isToday: date === todayInTz(),
    chores,
    reflection: reflection ? { question: reflection.question, answer: reflection.answer } : null,
    training: training
      ? { restDay: training.rest_day, skills: training.skills ?? [], workedOn: training.worked_on, winPrompt: training.win_prompt, win: training.win }
      : null,
  })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatClock, timeToMinutes, zonedParts, FAMILY_TZ } from './dates'
import { PROOF_META, activeOnly, proofTypeOf } from './proof'
import { PHOTO_BUCKET, photoPathFromUrl } from './storage'

export interface SummaryChore {
  name: string
  status: string
  proofIcon: string
  late: boolean
  cutoff: string | null
  photoUrl: string | null
  reviewNote: string | null
}

export interface ChildSummary {
  name: string
  emoji: string
  streak: number
  done: number
  total: number
  chores: SummaryChore[]
}

export interface FamilySummary {
  familyId: string
  familyName: string
  date: string
  recipients: string[]
  children: ChildSummary[]
}

const DONE = new Set(['approved', 'submitted'])

function shownForParents(c: SummaryChore) {
  // "Done" in the email means shown: approved, or a photo that is in.
  return c.status === 'approved' || (c.status === 'submitted' && c.proofIcon === PROOF_META.photo.icon)
}

function minutesInTz(iso: string): number {
  return zonedParts(new Date(iso), FAMILY_TZ).minutes
}

/** Build today's report for every family that has a parent email on file. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildSummaries(supabase: SupabaseClient<any, any, any>, now: Date = new Date()): Promise<FamilySummary[]> {
  const { date } = zonedParts(now)

  const { data: parents } = await supabase
    .from('profiles')
    .select('family_id, email')
    .eq('role', 'parent')
    .not('email', 'is', null)
  const byFamily = new Map<string, string[]>()
  for (const p of parents ?? []) {
    if (!p.email) continue
    byFamily.set(p.family_id, [...(byFamily.get(p.family_id) ?? []), p.email])
  }

  const out: FamilySummary[] = []
  for (const [familyId, recipients] of byFamily) {
    const { data: family } = await supabase.from('families').select('name').eq('id', familyId).single()
    const { data: kids } = await supabase
      .from('profiles')
      .select('id, name, avatar_emoji, current_streak')
      .eq('family_id', familyId)
      .eq('role', 'child')
      .order('name')

    const children: ChildSummary[] = []
    for (const kid of kids ?? []) {
      const { data: tasks } = await supabase
        .from('task_instances')
        .select('status, photo_url, submitted_at, review_note, task_template:task_templates(*)')
        .eq('assigned_to', kid.id)
        .eq('due_date', date)
      const live = activeOnly(tasks)
      if (!live.length) continue

      const chores: SummaryChore[] = []
      for (const t of live) {
        const tpl = t.task_template
        const cutoff: string | null = tpl?.cutoff_time ?? null
        const late = !!(cutoff && t.submitted_at && minutesInTz(t.submitted_at) > timeToMinutes(cutoff))

        let photoUrl: string | null = null
        const path = photoPathFromUrl(t.photo_url)
        if (path) {
          // A week is long enough to look back at the email.
          const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7)
          photoUrl = data?.signedUrl ?? null
        }

        chores.push({
          name: tpl?.name ?? 'Chore',
          status: t.status,
          proofIcon: PROOF_META[proofTypeOf(tpl)].icon,
          late,
          cutoff,
          photoUrl,
          reviewNote: t.review_note,
        })
      }

      // Not done first: that is what a parent needs to see.
      chores.sort((a, b) => Number(shownForParents(a)) - Number(shownForParents(b)))

      children.push({
        name: kid.name,
        emoji: kid.avatar_emoji ?? '',
        streak: kid.current_streak ?? 0,
        done: chores.filter(shownForParents).length,
        total: chores.length,
        chores,
      })
    }

    if (children.length) {
      out.push({ familyId, familyName: family?.name ?? 'Your family', date, recipients, children })
    }
  }
  return out
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function statusLabel(c: SummaryChore): { text: string; color: string } {
  switch (c.status) {
    case 'approved':
      return { text: c.late ? 'Done (late)' : 'Done', color: '#15803d' }
    case 'submitted':
      return c.proofIcon === PROOF_META.photo.icon
        ? { text: c.late ? 'Photo sent (late)' : 'Photo sent', color: '#15803d' }
        : { text: c.late ? 'Says done (late), confirm it' : 'Says done, confirm it', color: '#0f766e' }
    case 'rejected':
      return { text: 'Sent back to redo', color: '#b45309' }
    default:
      return { text: 'Not done', color: '#b91c1c' }
  }
}

export function summarySubject(s: FamilySummary): string {
  return s.children.map((c) => `${c.name} ${c.done}/${c.total}`).join(' · ') + ' — chores today'
}

export function summaryText(s: FamilySummary): string {
  return s.children
    .map((c) => {
      const lines = c.chores.map((ch) => `${shownForParents(ch) ? '✓' : DONE.has(ch.status) ? '…' : '✗'} ${ch.name} — ${statusLabel(ch).text}`)
      return `${c.name}: ${c.done} of ${c.total} done${c.streak ? ` · ${c.streak}-day streak` : ''}\n${lines.join('\n')}`
    })
    .join('\n\n')
}

export function summaryHtml(s: FamilySummary, appUrl: string): string {
  const dateLabel = new Date(`${s.date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  const kids = s.children
    .map((c) => {
      const allDone = c.done === c.total
      const rows = c.chores
        .map((ch) => {
          const st = statusLabel(ch)
          const thumb = ch.photoUrl
            ? `<a href="${esc(ch.photoUrl)}"><img src="${esc(ch.photoUrl)}" width="56" height="56" alt="Proof photo" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:8px;border:0"></a>`
            : `<div style="width:56px;height:56px;border-radius:8px;background:#f1f5f9;text-align:center;line-height:56px;font-size:22px">${ch.proofIcon}</div>`
          const by = ch.cutoff ? ` · due by ${formatClock(ch.cutoff)}` : ''
          const note = ch.reviewNote ? `<div style="color:#64748b;font-size:13px;margin-top:2px">“${esc(ch.reviewNote)}”</div>` : ''
          return `<tr>
  <td style="padding:8px 12px 8px 0;vertical-align:top;width:56px">${thumb}</td>
  <td style="padding:8px 0;vertical-align:top">
    <div style="font-size:15px;color:#0f172a;font-weight:600">${esc(ch.name)}</div>
    <div style="font-size:13px;color:${st.color};font-weight:600">${st.text}<span style="color:#64748b;font-weight:400">${by}</span></div>${note}
  </td></tr>`
        })
        .join('')
      return `<div style="margin:0 0 28px">
  <div style="font-size:20px;font-weight:700;color:#0f172a">${esc(c.emoji)} ${esc(c.name)}: ${c.done} of ${c.total} done</div>
  <div style="font-size:14px;color:${allDone ? '#15803d' : '#b91c1c'};margin:4px 0 8px">${allDone ? 'Everything done today.' : `${c.total - c.done} still not done.`}${c.streak ? ` <span style="color:#64748b">· ${c.streak}-day streak</span>` : ''}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${rows}</table>
</div>`
    })
    .join('')

  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto">
  <div style="font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">${esc(s.familyName)} · ${dateLabel}</div>
  <div style="height:16px"></div>
  ${kids}
  <a href="${esc(appUrl)}/review" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px;font-size:14px">Open ChoreZap</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Sent every evening. Photo links expire after 7 days.</p>
</div></body></html>`
}

/** Send through Resend's HTTP API. Returns false (and logs) if not configured. */
export async function sendSummaryEmail(s: FamilySummary, appUrl: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' }
  const from = process.env.SUMMARY_FROM || 'ChoreZap <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: s.recipients,
      subject: summarySubject(s),
      html: summaryHtml(s, appUrl),
      text: summaryText(s),
    }),
  })
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` }
  return { ok: true }
}

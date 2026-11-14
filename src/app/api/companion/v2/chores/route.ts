import { NextRequest } from 'next/server'
import { adminClient } from '@/lib/session'
import { desktopError, desktopIdentity } from '@/lib/companion/desktop-server'
import { denverDay } from '@/lib/companion/activity'
import { sha256 } from '@/lib/companion/pairing'
import { summarizeChores, type ChoreRow } from '@/lib/companion/chores'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const client = await desktopIdentity(req)
    if (!client) return desktopError('Link expired or revoked.', 401)

    const admin = adminClient()
    const day = denverDay()
    const [tasks, child, settings] = await Promise.all([
      admin.from('task_instances')
        .select('id,status,template:task_templates!inner(name,required,xp_value,proof_type,photo_required)')
        .eq('assigned_to', client.child_id).eq('due_date', day)
        .eq('template.family_id', client.family_id).eq('template.active', true)
        .order('id').limit(201),
      admin.from('profiles').select('name').eq('id', client.child_id).eq('family_id', client.family_id).eq('role', 'child').single(),
      admin.from('family_control_settings').select('enabled,require_parent_approval').eq('child_id', client.child_id).eq('family_id', client.family_id).maybeSingle(),
    ])
    if (tasks.error || child.error || settings.error || tasks.data.length > 200) return desktopError('Could not load today’s chores.', 503)

    // Supabase's inferred type for this embed is an array in some generated clients.
    const rows = tasks.data.map(row => ({ ...row, template: Array.isArray(row.template) ? row.template[0] : row.template })) as ChoreRow[]
    const summary = summarizeChores(rows, day, child.data.name, !!(settings.data?.enabled && settings.data.require_parent_approval))
    const body = JSON.stringify(summary)
    const tag = `"${sha256(body)}"`
    const headers = { 'Cache-Control': 'private, no-cache', ETag: tag, Vary: 'Authorization' }
    if (req.headers.get('if-none-match')?.split(',').some(value => value.trim().replace(/^W\//, '') === tag || value.trim() === '*')) {
      return new Response(null, { status: 304, headers })
    }
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch {
    return desktopError('Could not load today’s chores.', 503)
  }
}

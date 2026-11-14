import { NextRequest } from 'next/server'
import { requireParent, childInFamily } from '@/lib/api-auth'
import { limitedJson, sameOrigin } from '@/lib/companion/desktop-server'
import { UUID } from '@/lib/family-controls/policy'
import { cleanPresenceSettingsRequest, PRESENCE_DELIVERY_NOTE, PRESENCE_THRESHOLD_MINUTES } from '@/lib/companion/presence'
import { response, failure } from '@/lib/family-controls/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireParent()
  if (auth.error) return auth.error
  const { admin, me } = auth
  const childId = req.nextUrl.searchParams.get('childId') ?? ''
  if (!UUID.test(childId) || !await childInFamily(admin, me.family_id, childId)) return failure(new Error('Child not found.'), 404)

  const [settings, events] = await Promise.all([
    admin.from('companion_presence_settings')
      .select('enabled,enabled_at')
      .eq('family_id', me.family_id)
      .eq('child_id', childId)
      .maybeSingle(),
    admin.from('companion_presence_events')
      .select('id,kind,occurred_at,device_name')
      .eq('family_id', me.family_id)
      .eq('child_id', childId)
      .order('occurred_at', { ascending: false })
      .limit(30),
  ])
  if (settings.error || events.error) return failure(new Error('Could not load PC presence notices.'), 503)
  return response({
    enabled: settings.data?.enabled ?? false,
    thresholdMinutes: PRESENCE_THRESHOLD_MINUTES,
    events: events.data ?? [],
    deliveryNote: PRESENCE_DELIVERY_NOTE,
  })
}

export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return failure(new Error('Open this screen from ChoreZap.'), 403)
    const auth = await requireParent()
    if (auth.error) return auth.error
    const { childId, enabled } = cleanPresenceSettingsRequest(await limitedJson(req, 2048))
    const { admin, me } = auth
    if (!await childInFamily(admin, me.family_id, childId)) return failure(new Error('Child not found.'), 404)
    const { error } = await admin.rpc('companion_presence_settings_save', {
      p_family: me.family_id,
      p_child: childId,
      p_actor: me.id,
      p_enabled: enabled,
    })
    if (error) return failure(new Error('PC presence settings could not be saved.'), 503)
    return response({ ok: true })
  } catch (error) {
    return failure(error)
  }
}

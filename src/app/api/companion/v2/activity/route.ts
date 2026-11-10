import { NextRequest,NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { sha256 } from '@/lib/companion/pairing'
import { cleanActivity, aggregateApps, denverDay } from '@/lib/companion/activity'
import { desktopIdentity,limitedJson,desktopError } from '@/lib/companion/desktop-server'
import { effectiveGameRules } from '@/lib/companion/game-suggestions'
import { sendToProfiles, parentIds, bestEffort } from '@/lib/push'
import { gamingAlertPayload } from '@/lib/push-copy'
export const dynamic='force-dynamic'

async function checkGamingAlert(client: { id: string; family_id: string; child_id: string }) {
  try {
    const admin = adminClient()
    const day = denverDay()
    const [batches, rules, settings, profile] = await Promise.all([
      admin.from('companion_activity').select('apps').eq('family_id', client.family_id).eq('child_id', client.child_id).eq('day', day).limit(1500),
      admin.from('companion_app_rules').select('executable,label,category,daily_minutes').eq('family_id', client.family_id).eq('child_id', client.child_id),
      admin.from('companion_limits').select('gaming_minutes').eq('family_id', client.family_id).eq('child_id', client.child_id).maybeSingle(),
      admin.from('profiles').select('name').eq('id', client.child_id).single(),
    ])
    const limitMin = settings.data?.gaming_minutes ?? null
    if (!limitMin) return // no limit set, no alerts

    const apps = aggregateApps(batches.data ?? [])
    const effective = effectiveGameRules(apps, rules.data ?? [])
    const gameExes = new Set(effective.filter(r => r.category === 'game').map(r => r.executable))
    const gamingSec = apps.filter(a => gameExes.has(a.executable)).reduce((s, a) => s + a.seconds, 0)
    const pct = (gamingSec / (limitMin * 60)) * 100

    const threshold: 80 | 100 | null = pct >= 100 ? 100 : pct >= 80 ? 80 : null
    if (!threshold) return

    // Try to claim this alert (upsert won't fire if already sent today)
    const { error } = await admin.from('gaming_alert_log').insert({
      family_id: client.family_id,
      child_id: client.child_id,
      day,
      pct_threshold: threshold,
    })
    if (error) return // already sent (duplicate key) or db error — skip

    const kidName = profile.data?.name ?? 'Grey'
    const usedMin = Math.floor(gamingSec / 60)
    const payload = gamingAlertPayload(kidName, threshold, usedMin, limitMin)
    const pids = await parentIds(admin, client.family_id)
    await sendToProfiles(admin, pids, payload)
  } catch {
    // best-effort — never fail the activity POST
  }
}

export async function POST(req:NextRequest){
 try{
  const client=await desktopIdentity(req);if(!client)return desktopError('Link expired or revoked.',401)
  const b=cleanActivity(await limitedJson(req))
  const admin=adminClient()
  const {data,error}=await admin.rpc('companion_v2_record',{p_client:client.id,p_batch:b.id,p_start:b.start,p_end:b.end,p_apps:b.apps,p_gaps:b.gaps,p_version:b.version,p_hash:sha256(JSON.stringify(b))})
  if(error)return desktopError('Could not save activity.',503)
  if(data?.error)return desktopError(data.error,data.error==='rate_limit'?429:409)
  bestEffort(checkGamingAlert(client))
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return desktopError(e)}
}

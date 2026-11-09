import {familyOverview} from '@/lib/family-controls/server'
import {effectiveGameRules} from './game-suggestions'
import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { sha256 } from './pairing'
import { aggregateApps, denverDay } from './activity'

export async function limitedJson(req: NextRequest, max=64*1024): Promise<unknown> {
  if (!req.body) throw new Error('Missing request body.')
  const reader=req.body.getReader(), chunks:Uint8Array[]=[]; let size=0
  for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>max){await reader.cancel();throw new Error('Request too large.')}chunks.push(value) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export function desktopError(error:unknown,status=400) { return NextResponse.json({error:error instanceof Error?error.message:typeof error==='string'?error:'Request failed.'},{status,headers:{'Cache-Control':'no-store'}}) }
export function sameOrigin(req:NextRequest) { return req.headers.get('origin')===req.nextUrl.origin }
export async function desktopIdentity(req:NextRequest) {
  const raw=(req.headers.get('authorization')??'').replace(/^Bearer /i,'')
  if(!/^[a-f0-9]{64}$/.test(raw))return null
  const admin=adminClient()
  const {data,error}=await admin.from('companion_clients').select('id,family_id,child_id,name').eq('token_hash',sha256(raw)).is('revoked_at',null).maybeSingle()
  if(error)throw new Error('Companion database unavailable.')
  return data
}
export async function desktopSnapshot(client:{id:string;family_id:string;child_id:string}) {
  const admin=adminClient(),day=denverDay()
  const [rules,settings,batches,profile]=await Promise.all([
    admin.from('companion_app_rules').select('executable,label,category,daily_minutes').eq('family_id',client.family_id).eq('child_id',client.child_id),
    admin.from('companion_limits').select('gaming_minutes,paused,mode').eq('family_id',client.family_id).eq('child_id',client.child_id).maybeSingle(),
    admin.from('companion_activity').select('client_id,apps').eq('family_id',client.family_id).eq('child_id',client.child_id).eq('day',day).limit(1500),
    admin.from('profiles').select('name').eq('id',client.child_id).eq('family_id',client.family_id).single(),
  ])
  if(rules.error||settings.error||batches.error||profile.error)throw new Error('Could not load companion settings.')
  const family = await familyOverview(admin,client.family_id,client.child_id)
  const baseSettings = settings.data??{gaming_minutes:null,paused:false,mode:'warn'}
  const enabled = family.settings.enabled
  return {clientId:client.id,childName:profile.data.name,serverTime:new Date().toISOString(),day,
    rules:effectiveGameRules(aggregateApps(batches.data??[]),rules.data??[]),
    settings:enabled?{...baseSettings,gaming_minutes:family.game.grantedSeconds/60,paused:baseSettings.paused||!family.game.allowed}:baseSettings,
    otherApps:aggregateApps((batches.data??[]).filter(b=>b.client_id!==client.id)),ownApps:aggregateApps((batches.data??[]).filter(b=>b.client_id===client.id)),
    policyLeaseSeconds:enabled?900:14400,
    familyPolicy:{enabled,revision:family.settings.revision,day:family.day,timezone:family.settings.timezone,eligible:family.game.eligible,allowed:family.game.allowed,reason:family.game.reason,expiresAt:family.game.nextChangeAt},
  }
}

import { adminClient } from '@/lib/session'
import { aggregateApps } from '@/lib/companion/activity'
import { effectiveGameRules } from '@/lib/companion/game-suggestions'
import { DEFAULT_SETTINGS, gameDecision, localParts } from './policy'
import type { FamilyIncident, FamilyOverview, FamilySettings, JobOffer, MoneyEntry } from './types'

type Admin = ReturnType<typeof adminClient>
export async function familyOverview(db: Admin, familyId: string, childId: string, now = new Date()): Promise<FamilyOverview> {
  const [profile, state, account, jobs, entries, devices, incidents] = await Promise.all([
    db.from('profiles').select('name').eq('id',childId).eq('family_id',familyId).eq('role','child').single(),
    db.rpc('family_game_state',{p_family:familyId,p_child:childId}),
    db.from('family_money_accounts').select('initialized,debt_remaining_cents,cash_owed_cents').eq('child_id',childId).eq('family_id',familyId).maybeSingle(),
    db.from('family_job_offers').select('id,title,description,criteria,price_cents,status,child_note,review_note,created_at').eq('family_id',familyId).eq('child_id',childId).order('created_at',{ascending:false}).limit(100),
    db.from('family_money_entries').select('id,kind,description,debt_delta_cents,cash_delta_cents,created_at').eq('family_id',familyId).eq('child_id',childId).order('created_at',{ascending:false}).limit(50),
    db.from('companion_clients').select('id,name,version,last_seen_at,applied_revision,applied_at').eq('family_id',familyId).eq('child_id',childId).is('revoked_at',null),
    db.from('family_incidents').select('id,kind,note,consequence,created_at,resolved_at,resolution_note').eq('family_id',familyId).eq('child_id',childId).order('created_at',{ascending:false}).limit(30),
  ])
  if ([profile,state,account,jobs,entries,devices,incidents].some(r=>r.error)) throw new Error('Family rules could not be loaded. Check the connection and try again.')
  const s = (state.data.settings ?? DEFAULT_SETTINGS) as FamilySettings
  const day = localParts(now,s.timezone).day
  if (state.data.day !== day) throw new Error('The family day changed. Refresh to load today’s rules.')
  const [activity,rules,extraGrant] = await Promise.all([
    db.from('companion_activity').select('client_id,apps,period_end').eq('family_id',familyId).eq('child_id',childId).eq('day',day).order('period_end',{ascending:false}).limit(1500),
    db.from('companion_app_rules').select('executable,label,category,daily_minutes').eq('family_id',familyId).eq('child_id',childId),
    db.from('family_game_grants').select('seconds').eq('family_id',familyId).eq('child_id',childId).eq('day',day).eq('kind','extra').maybeSingle(),
  ])
  if(activity.error||rules.error||extraGrant.error) throw new Error('PC usage could not be loaded.')
  const apps=aggregateApps(activity.data??[]), effective=effectiveGameRules(apps,rules.data??[])
  const usedSeconds=Math.ceil(apps.filter(a=>effective.some(r=>r.executable===a.executable&&r.category==='game')).reduce((sum,a)=>sum+a.seconds,0))
  const todayCapMinutes: number|null = state.data.todayCapMinutes ?? null
  const baseSeconds: number|null = s.enabled ? state.data.grantedSeconds : state.data.legacyMinutes == null ? null : state.data.legacyMinutes * 60
  const budgetSeconds = todayCapMinutes === null ? baseSeconds : Math.min(baseSeconds ?? Infinity, todayCapMinutes * 60)
  const remainingSeconds = Math.max(0, (budgetSeconds ?? 0) - usedSeconds)
  const paused = state.data.pcPaused === true
  const mode = state.data.pcMode === 'close' ? 'close' : 'warn'
  const lastActivityAt = activity.data?.[0]?.period_end ?? null
  const activeIncidents=(incidents.data??[]).filter(i=>!i.resolved_at) as FamilyIncident[]
  const blockingIncident=activeIncidents.find(i=>i.consequence==='block_games')
  const decision=gameDecision(s,state.data.eligible,remainingSeconds,paused,now)
  if(blockingIncident){decision.allowed=false;decision.reason=`Games blocked by a parent: ${blockingIncident.note}`}
  if(s.enabled&&(devices.data?.length??0)>1){decision.allowed=false;decision.reason="This pilot supports one linked PC per child. Unlink extra PCs in PC time."}
  const deviceVersion=devices.data?.[0]?.version?.split('.').map(Number)??[]
  if(s.enabled&&devices.data?.length===1&&!(deviceVersion[0]>0||(deviceVersion[0]===0&&deviceVersion[1]>=3))){decision.allowed=false;decision.reason="Update the PC companion to 0.3.0 or newer to use earned game time."}
  if(s.enabled&&!devices.data?.length){decision.allowed=false;decision.reason="Game minutes are saved. Link a PC to use them."}
  return {
    childId,childName:profile.data!.name,day,settings:s,
    game:{...state.data,extraGrantSeconds:extraGrant.data?.seconds??0,usedSeconds,remainingSeconds,paused,budgetSeconds,todayCapMinutes,mode,lastActivityAt,...decision},
    money:{initialized:account.data?.initialized??false,debtRemainingCents:account.data?.debt_remaining_cents??0,cashOwedCents:account.data?.cash_owed_cents??0,entries:(entries.data??[]) as MoneyEntry[]},
    jobs:(jobs.data??[]) as JobOffer[],
    incidents:(incidents.data??[]) as FamilyIncident[],
    devices:devices.data??[],
  }
}

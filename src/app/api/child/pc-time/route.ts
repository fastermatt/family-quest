import { familyOverview } from '@/lib/family-controls/server'
import {effectiveGameRules} from '@/lib/companion/game-suggestions'
import { NextResponse } from 'next/server'
import { adminClient, getSessionProfile } from '@/lib/session'
import { aggregateApps, denverDay } from '@/lib/companion/activity'
export const dynamic = 'force-dynamic'
export async function GET() {
 const me = await getSessionProfile()
 if (!me || me.role !== 'child') return NextResponse.json({error:'Sign in as yourself to see your PC time.'},{status:401})
 const db=adminClient(),day=denverDay()
 const [usage,rules,limits,devices]=await Promise.all([
  db.from('companion_activity').select('apps,period_end,gaps').eq('family_id',me.family_id).eq('child_id',me.id).eq('day',day).order('period_end',{ascending:false}).limit(1500),
  db.from('companion_app_rules').select('executable,label,category,daily_minutes').eq('family_id',me.family_id).eq('child_id',me.id),
  db.from('companion_limits').select('gaming_minutes,paused,mode').eq('family_id',me.family_id).eq('child_id',me.id).maybeSingle(),
  db.from('companion_clients').select('id').eq('family_id',me.family_id).eq('child_id',me.id).is('revoked_at',null)
 ])
 if([usage,rules,limits,devices].some(r=>r.error))return NextResponse.json({error:'PC time could not be loaded.'},{status:503})
 let family
 try{family=await familyOverview(db,me.family_id,me.id)}catch{return NextResponse.json({error:'Could not load earned game time.'},{status:503})}
 const effective=effectiveGameRules(aggregateApps(usage.data??[]),rules.data??[])
 const apps=aggregateApps(usage.data??[]).map(a=>{const r=effective.find(r=>r.executable===a.executable);return {name:r?.label??a.hint?.label??a.executable,category:r?.category??'other',seconds:a.seconds}})
 return NextResponse.json({day,linked:!!devices.data?.length,apps,gaming:apps.filter(a=>a.category==='game').reduce((s,a)=>s+a.seconds,0),total:apps.reduce((s,a)=>s+a.seconds,0),lastUpload:usage.data?.[0]?.period_end??null,familyRulesEnabled:family.settings.enabled,familyReason:family.game.reason,settings:family.settings.enabled?{...(limits.data??{mode:'warn'}),gaming_minutes:family.game.grantedSeconds/60,paused:limits.data?.paused??false}:(limits.data??{gaming_minutes:null,paused:false,mode:'warn'})},{headers:{'Cache-Control':'no-store'}})
}

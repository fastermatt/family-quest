import {familyOverview} from '@/lib/family-controls/server'
import {NextRequest,NextResponse} from 'next/server'
import {requireParent,childInFamily} from '@/lib/api-auth'
import {sha256} from '@/lib/companion/pairing'
import {cleanAppRule,aggregateApps,denverDay,UUID} from '@/lib/companion/activity'
import {limitedJson,desktopError,sameOrigin} from '@/lib/companion/desktop-server'
import {gameSuggestions,effectiveGameRules} from '@/lib/companion/game-suggestions'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const auth=await requireParent();if(auth.error)return auth.error
 const {admin,me}=auth
 const {data:children}=await admin.from('profiles').select('id,name').eq('family_id',me.family_id).eq('role','child')
 const childId=req.nextUrl.searchParams.get('childId')??children?.[0]?.id
 if(!childId||!children?.some(c=>c.id===childId))return NextResponse.json({children:children??[],clients:[],apps:[],rules:[],settings:{gaming_minutes:null,paused:false,mode:'warn'}})
 const [clients,rules,settings,batches]=await Promise.all([
  admin.from('companion_clients').select('id,name,last_seen_at,version').eq('family_id',me.family_id).eq('child_id',childId).is('revoked_at',null),
  admin.from('companion_app_rules').select('executable,label,category,daily_minutes').eq('family_id',me.family_id).eq('child_id',childId),
  admin.from('companion_limits').select('gaming_minutes,paused,mode').eq('family_id',me.family_id).eq('child_id',childId).maybeSingle(),
  admin.from('companion_activity').select('apps,period_end').eq('family_id',me.family_id).eq('child_id',childId).eq('day',denverDay()).order('period_end',{ascending:false}).limit(1500),
 ])
 if(clients.error||rules.error||settings.error||batches.error)return desktopError('Could not load PC activity.',503)
 let family
 try{family=await familyOverview(admin,me.family_id,childId)}catch{return desktopError("Could not load family game rules.",503)}
 const apps=aggregateApps(batches.data??[])
 const effective=effectiveGameRules(apps,rules.data??[])
 return NextResponse.json({suggestions:gameSuggestions(apps,effective),childId,children,clients:clients.data,rules:effective,familyRulesEnabled:family.settings.enabled,familyReason:family.game.reason,settings:family.settings.enabled?{...(settings.data??{paused:false,mode:'warn'}),gaming_minutes:family.game.grantedSeconds/60}:(settings.data??{gaming_minutes:null,paused:false,mode:'warn'}),apps,lastUpload:batches.data?.[0]?.period_end??null,day:denverDay()},{headers:{'Cache-Control':'no-store'}})
}
export async function POST(req:NextRequest){
 try{
  if(!sameOrigin(req))return desktopError('Open this screen from ChoreZap.',403)
  const auth=await requireParent();if(auth.error)return auth.error
  const {admin,me}=auth,b=await limitedJson(req,8192) as Record<string,unknown>
  if(!UUID.test(String(b.childId))||!await childInFamily(admin,me.family_id,String(b.childId)))return desktopError('Child not found.',404)
  if(b.action==='claim'){
   const code=String(b.code).replace(/[\s-]/g,'').toLowerCase()
   if(!/^[a-f0-9]{24}$/.test(code))throw new Error('Enter the 24-character code shown on the PC.')
   const {data,error}=await admin.rpc('companion_v2_claim',{p_claim:sha256(code),p_family:me.family_id,p_child:b.childId})
   if(error)return desktopError('Could not link PC.',503)
   if(data?.error)return desktopError(data.error,409)
  }else if(b.action==='classify-games'){
   if(!Array.isArray(b.executables)||!b.executables.length||b.executables.length>100||b.executables.some(e=>typeof e!=='string'))throw new Error('Choose the games to classify.')
   const [activity,existing]=await Promise.all([
    admin.from('companion_activity').select('apps').eq('family_id',me.family_id).eq('child_id',b.childId).eq('day',denverDay()).limit(1500),
    admin.from('companion_app_rules').select('executable').eq('family_id',me.family_id).eq('child_id',b.childId),
   ])
   if(activity.error||existing.error)return desktopError('Could not load game suggestions.',503)
   const selected=new Set(b.executables)
   const suggestions=gameSuggestions(aggregateApps(activity.data??[]),existing.data??[]).filter(s=>selected.has(s.executable))
   if(!suggestions.length)throw new Error('These suggestions changed. Refresh the page and try again.')
   const rows=suggestions.map(s=>({...cleanAppRule({executable:s.executable,label:s.label,category:'game',dailyMinutes:null}),family_id:me.family_id,child_id:b.childId}))
   const {error}=await admin.from('companion_app_rules').upsert(rows,{onConflict:'family_id,child_id,executable',ignoreDuplicates:true})
   if(error)return desktopError('Could not save games.',503)
  }else if(b.action==='app'){
   const rule=cleanAppRule(b)
   const {error}=await admin.from('companion_app_rules').upsert({...rule,family_id:me.family_id,child_id:b.childId},{onConflict:'family_id,child_id,executable'})
   if(error)return desktopError('Could not save application rule.',503)
  }else if(b.action==='limits'){
   const minutes=b.gamingMinutes===null?null:Number(b.gamingMinutes)
   if(minutes!==null&&(!Number.isInteger(minutes)||minutes<0||minutes>1440))throw new Error('Choose 0–1440 minutes or unlimited.')
   if(typeof b.paused!=='boolean'||!['warn','close'].includes(String(b.mode)))throw new Error('Choose a limit behavior.')
   const [family,current]=await Promise.all([
    admin.from('family_control_settings').select('enabled').eq('family_id',me.family_id).eq('child_id',b.childId).maybeSingle(),
    admin.from('companion_limits').select('gaming_minutes').eq('family_id',me.family_id).eq('child_id',b.childId).maybeSingle(),
   ])
   if(family.error||current.error)return desktopError('Could not check current game rules.',503)
   const {error}=await admin.from('companion_limits').upsert({family_id:me.family_id,child_id:b.childId,gaming_minutes:family.data?.enabled?(current.data?.gaming_minutes??null):minutes,paused:b.paused,mode:b.mode},{onConflict:'family_id,child_id'})
   if(error)return desktopError('Could not save time limit.',503)
  }else if(b.action==='revoke'){
   if(!UUID.test(String(b.clientId)))throw new Error('Invalid PC.')
   const {error}=await admin.from('companion_clients').update({revoked_at:new Date().toISOString()}).eq('id',b.clientId).eq('family_id',me.family_id).eq('child_id',b.childId)
   if(error)return desktopError('Could not unlink PC.',503)
  }else throw new Error('Unknown action.')
  return NextResponse.json({ok:true})
 }catch(e){return desktopError(e)}
}

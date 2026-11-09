import { NextRequest } from 'next/server'
import { requireParent, childInFamily } from '@/lib/api-auth'
import { limitedJson, sameOrigin } from '@/lib/companion/desktop-server'
import { cleanSettings, integer, text, UUID } from '@/lib/family-controls/policy'
import { familyOverview } from '@/lib/family-controls/server'
import { response, failure, rpcFailure, cleanMoneyAction } from '@/lib/family-controls/http'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest) {
 const auth=await requireParent();if(auth.error)return auth.error
 const {admin,me}=auth
 const {data:children,error}=await admin.from('profiles').select('id,name').eq('family_id',me.family_id).eq('role','child').order('created_at')
 if(error)return failure(new Error('Could not load the family.'),503)
 const childId=req.nextUrl.searchParams.get('childId')||children?.[0]?.id
 if(!childId)return response({children:[],overview:null})
 if(!children?.some(c=>c.id===childId))return failure(new Error('Child not found.'),404)
 const {data:privileges,error:rewardError}=await admin.from('privileges').select('id,name').eq('family_id',me.family_id)
 if(rewardError)return failure(new Error('Could not load rewards.'),503)
 try{return response({children,privileges,overview:await familyOverview(admin,me.family_id,childId)})}catch(e){return failure(e,503)}
}
export async function POST(req:NextRequest) {
 try{
  if(!sameOrigin(req))return failure(new Error('Open this screen from ChoreZap.'),403)
  const auth=await requireParent();if(auth.error)return auth.error
  const {admin,me}=auth,b=await limitedJson(req,16384) as Record<string,unknown>
  if(!b||!UUID.test(String(b.childId))||!await childInFamily(admin,me.family_id,String(b.childId)))return failure(new Error('Child not found.'),404)
  const scope={p_family:me.family_id,p_child:String(b.childId),p_actor:me.id}
  let result
  if(b.action==='settings')result=await admin.rpc('family_save_settings',{...scope,p_settings:cleanSettings(b.settings)})
  else if(b.action==='bathroom-bonus')result=await admin.rpc('family_bathroom_bonus',{...scope,p_note:text(b.note,500,'confirmation of the completed bathroom clean')})
  else if(b.action==='extra-grant')result=await admin.rpc('family_extra_grant',{...scope,p_minutes:integer(b.minutes,0,240,'Extra minutes'),p_note:typeof b.minutes==='number'&&b.minutes>0?text(b.note,200,'a reason for the extra time'):'',})
  else if(b.action==='set-paused'){if(typeof b.paused!=='boolean')throw new Error('Invalid pause value.');result=await admin.rpc('family_set_paused',{...scope,p_paused:b.paused})}
  else if(b.action==='add-incident')result=await admin.rpc('family_add_incident',{...scope,p_kind:text(b.kind,30,'incident kind'),p_note:text(b.note,500,'what happened'),p_consequence:b.consequence==='none'?'none':'block_games'})
  else if(b.action==='resolve-incident'){if(!UUID.test(String(b.incidentId)))throw new Error('Invalid incident.');result=await admin.rpc('family_resolve_incident',{...scope,p_id:String(b.incidentId),p_note:text(b.note,500,'resolution note')})}
  else result=await admin.rpc('family_money_action',{...scope,p_action:String(b.action),p_body:cleanMoneyAction(b)})
  if(result.error)return rpcFailure(result.error)
  return response({ok:true})
 }catch(e){return failure(e)}
}

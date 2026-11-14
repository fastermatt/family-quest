import { NextRequest } from 'next/server'
import { requireChild } from '@/lib/api-auth'
import { getSessionProfile, adminClient } from '@/lib/session'
import { limitedJson, sameOrigin } from '@/lib/companion/desktop-server'
import { familyOverview } from '@/lib/family-controls/server'
import { response, failure, rpcFailure, cleanMoneyAction } from '@/lib/family-controls/http'
export const dynamic='force-dynamic'
export async function GET() {
 const auth=await requireChild();if(auth.error)return auth.error
 try{return response(await familyOverview(auth.admin,auth.me.family_id,auth.me.id))}catch(e){return failure(e,503)}
}
export async function POST(req:NextRequest) {
 try{
  if(!sameOrigin(req))return failure(new Error('Open this screen from ChoreZap.'),403)
  const me=await getSessionProfile()
  if(!me)return failure(new Error('Please sign in again.'),401)
  if(me.role!=='child')return failure(new Error('Sign in as yourself to accept or submit a job.'),403)
  const b=await limitedJson(req,4096) as Record<string,unknown>
  if(!b||typeof b!=='object')throw new Error('Invalid request.')
  const {error}=await adminClient().rpc('family_money_action',{p_family:me.family_id,p_child:me.id,p_actor:me.id,p_action:String(b.action),p_body:cleanMoneyAction(b,true)})
  if(error)return rpcFailure(error)
  return response({ok:true})
 }catch(e){return failure(e)}
}

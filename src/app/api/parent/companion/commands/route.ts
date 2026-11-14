import { NextRequest } from 'next/server'
import { requireParent, childInFamily } from '@/lib/api-auth'
import { limitedJson, sameOrigin } from '@/lib/companion/desktop-server'
import { commandRequest } from '@/lib/companion/maintenance'
import { response, failure, rpcFailure } from '@/lib/family-controls/http'
import { UUID } from '@/lib/family-controls/policy'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest) {
 const auth=await requireParent();if(auth.error)return auth.error
 const {admin,me}=auth,childId=req.nextUrl.searchParams.get('childId')??''
 if(!UUID.test(childId)||!await childInFamily(admin,me.family_id,childId))return failure(new Error('Child not found.'),404)
 const [devices,commands]=await Promise.all([
  admin.from('companion_clients').select('id,name,version,last_seen_at').eq('family_id',me.family_id).eq('child_id',childId).is('revoked_at',null),
  admin.from('companion_commands').select('id,client_id,kind,status,created_at,expires_at,completed_at,result').eq('family_id',me.family_id).eq('child_id',childId).order('created_at',{ascending:false}).limit(20),
 ])
 if(devices.error||commands.error)return failure(new Error('Could not load PC maintenance.'),503)
 return response({devices:devices.data,commands:commands.data?.map(c=>({...c,status:['queued','running'].includes(c.status)&&Date.parse(c.expires_at)<=Date.now()?'expired':c.status}))})
}
export async function POST(req:NextRequest) {
 try{
  if(!sameOrigin(req))return failure(new Error('Open maintenance from ChoreZap.'),403)
  const auth=await requireParent();if(auth.error)return auth.error
  const b=commandRequest(await limitedJson(req,2048)),{admin,me}=auth
  const {data,error}=await admin.rpc('companion_queue_command',{p_family:me.family_id,p_actor:me.id,p_client:b.clientId,p_kind:b.kind,p_request:b.requestId})
  if(error)return rpcFailure(error)
  return response({ok:true,id:data})
 }catch(e){return failure(e)}
}

import { NextRequest,NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { sha256 } from '@/lib/companion/pairing'
import { cleanActivity } from '@/lib/companion/activity'
import { desktopIdentity,limitedJson,desktopError } from '@/lib/companion/desktop-server'
export const dynamic='force-dynamic'
export async function POST(req:NextRequest){
 try{
  const client=await desktopIdentity(req);if(!client)return desktopError('Link expired or revoked.',401)
  const b=cleanActivity(await limitedJson(req))
  const {data,error}=await adminClient().rpc('companion_v2_record',{p_client:client.id,p_batch:b.id,p_start:b.start,p_end:b.end,p_apps:b.apps,p_gaps:b.gaps,p_version:b.version,p_hash:sha256(JSON.stringify(b))})
  if(error)return desktopError('Could not save activity.',503)
  if(data?.error)return desktopError(data.error,data.error==='rate_limit'?429:409)
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return desktopError(e)}
}

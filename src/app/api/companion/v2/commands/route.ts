import { NextRequest } from 'next/server'
import { adminClient } from '@/lib/session'
import { desktopIdentity, limitedJson } from '@/lib/companion/desktop-server'
import { commandResult } from '@/lib/companion/maintenance'
import { response, failure, rpcFailure } from '@/lib/family-controls/http'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest) {
 try{
  const client=await desktopIdentity(req);if(!client)return failure(new Error('PC is not linked.'),401)
  const {data,error}=await adminClient().rpc('companion_next_command',{p_client:client.id})
  if(error)return rpcFailure(error)
  return response({command:data})
 }catch{return failure(new Error('Could not retrieve maintenance request.'),503)}
}
export async function POST(req:NextRequest) {
 try{
  const client=await desktopIdentity(req);if(!client)return failure(new Error('PC is not linked.'),401)
  const b=commandResult(await limitedJson(req,4096))
  const {error}=await adminClient().rpc('companion_finish_command',{p_client:client.id,p_id:b.id,p_status:b.status,p_result:b.result})
  if(error)return rpcFailure(error)
  return response({ok:true})
 }catch(e){return failure(e)}
}

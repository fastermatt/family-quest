import { NextRequest,NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { HASH } from '@/lib/companion/activity'
import { limitedJson,desktopError } from '@/lib/companion/desktop-server'
export const dynamic='force-dynamic'
export async function POST(req:NextRequest){
 try {
  const b=await limitedJson(req,2048) as Record<string,unknown>
  if(!HASH.test(String(b.claimHash))||!HASH.test(String(b.tokenHash))||!HASH.test(String(b.accountTag)))throw new Error('Invalid enrollment.')
  const name=typeof b.name==='string'?b.name.replace(/[\u0000-\u001f]/g,'').slice(0,60):'Windows PC'
  const admin=adminClient()
  const {data,error}=await admin.rpc('companion_v2_enroll',{p_claim:b.claimHash,p_token:b.tokenHash,p_account:b.accountTag,p_name:name})
  if(error)return desktopError('Could not start enrollment.',503)
  if(data?.error)return desktopError(data.error,429)
  if(HASH.test(String(b.pinHash)))await admin.from('companion_enrollments').update({pin_hash:String(b.pinHash)}).eq('claim_hash',String(b.claimHash)).is('client_id',null)
  return NextResponse.json({ok:true,expiresInSeconds:900},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return desktopError(e)}
}
